"""Clean Composer API client for fetching portfolio data."""

import csv
import io
import logging
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from typing import Dict, List, Optional, Tuple

import requests

from app.config import get_settings, AccountCredentials

logger = logging.getLogger(__name__)
_DEFAULT_HTTP_TIMEOUT = 30
_COMPOSER_ORIGIN = "public-api"
_SYMPHONY_STATS_CACHE_TTL_SECONDS = 15.0
_SYMPHONY_STATS_RATE_LIMIT_COOLDOWN_SECONDS = 15.0
_SYMPHONY_STATS_CACHE_MAX_ENTRIES = 128

_symphony_stats_cache_lock = Lock()
_symphony_stats_cache: Dict[Tuple[str, str, str], Dict[str, object]] = {}


class SymphonyStatsRateLimitError(RuntimeError):
    """Raised when symphony stats are rate-limited without a cached payload."""

# Map Composer account_type strings to friendly display names
ACCOUNT_TYPE_DISPLAY = {
    "INDIVIDUAL": "Taxable",
    "IRA_ROTH": "Roth IRA",
    "ROTH_IRA": "Roth IRA",
    "IRA_TRADITIONAL": "Traditional IRA",
    "TRADITIONAL_IRA": "Traditional IRA",
    "BUSINESS": "Business",
}


class ComposerClient:
    """Thin wrapper around the Composer Trade API.

    Constructed with explicit credentials (api_key_id + api_secret) for a
    specific Composer account credential set.
    """

    def __init__(self, api_key_id: str, api_secret: str, base_url: str = None):
        self.base_url = base_url or get_settings().composer_api_base_url
        self.__headers = {
            "x-api-key-id": api_key_id,
            "Authorization": f"Bearer {api_secret}",
            # Required for backtest-api / stagehand-api endpoints (watchlist, drafts, etc).
            "x-origin": _COMPOSER_ORIGIN,
            "accept": "application/json",
            "Content-Type": "application/json",
        }

    @property
    def headers(self) -> dict:
        return self.__headers

    def __repr__(self) -> str:
        """Prevent credentials from appearing in logs/tracebacks."""
        return f"ComposerClient(base_url={self.base_url!r})"

    def _symphony_stats_cache_key(self, account_id: str) -> Tuple[str, str, str]:
        return (
            self.base_url,
            str(self.headers.get("x-api-key-id", "")),
            account_id,
        )

    @staticmethod
    def _parse_retry_after_seconds(value: Optional[str]) -> Optional[float]:
        if not value:
            return None
        raw = str(value).strip()
        if not raw:
            return None
        if raw.isdigit():
            return max(0.0, float(raw))
        try:
            retry_dt = parsedate_to_datetime(raw)
            if retry_dt.tzinfo is None:
                retry_dt = retry_dt.replace(tzinfo=timezone.utc)
            now_utc = datetime.now(timezone.utc)
            return max(0.0, (retry_dt - now_utc).total_seconds())
        except Exception:
            return None

    @classmethod
    def from_credentials(cls, creds: AccountCredentials, base_url: str = None):
        """Create a client from an AccountCredentials object."""
        return cls(api_key_id=creds.api_key_id, api_secret=creds.api_secret, base_url=base_url)

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    def _get_json(self, endpoint: str, params: dict = None) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.get(url, headers=self.headers, params=params, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error(
                "RATE LIMITED (429) on GET %s - Retry-After: %s, body: %s",
                endpoint, retry_after, resp.text[:500],
            )
        resp.raise_for_status()
        return resp.json()

    def _get_csv(self, endpoint: str, params: dict = None) -> str:
        url = f"{self.base_url}/{endpoint}"
        hdrs = {**self.headers, "accept": "text/csv"}
        resp = requests.get(url, headers=hdrs, params=params, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error(
                "RATE LIMITED (429) on GET %s - Retry-After: %s, body: %s",
                endpoint, retry_after, resp.text[:500],
            )
        resp.raise_for_status()
        return resp.text

    # ------------------------------------------------------------------
    # Account discovery
    # ------------------------------------------------------------------

    def list_sub_accounts(self) -> List[Dict]:
        """Discover all sub-accounts for this credential set.

        Returns list of {account_id, account_type, display_name, status}.
        """
        data = self._get_json("api/v0.1/accounts/list")
        accounts = data if isinstance(data, list) else data.get("accounts", [])
        result = []
        for a in accounts:
            acct_type = a.get("account_type", "UNKNOWN")
            result.append({
                "account_id": a.get("account_uuid", a.get("id", "")),
                "account_type": acct_type,
                "display_name": ACCOUNT_TYPE_DISPLAY.get(acct_type, acct_type),
                "status": a.get("status", "UNKNOWN"),
            })
        return result

    # ------------------------------------------------------------------
    # Portfolio history (daily values)
    # ------------------------------------------------------------------

    def get_portfolio_history(self, account_id: str) -> List[Dict]:
        """Fetch daily portfolio values from the portfolio-history endpoint.

        Returns list of {'date': 'YYYY-MM-DD', 'portfolio_value': float} sorted by date.
        """
        aid = account_id
        data = self._get_json(f"api/v0.1/portfolio/accounts/{aid}/portfolio-history")

        epochs = data.get("epoch_ms", [])
        values = data.get("series", [])
        if len(epochs) != len(values):
            raise ValueError("portfolio-history length mismatch")

        result = []
        for ts_ms, val in zip(epochs, values):
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            result.append({"date": dt.strftime("%Y-%m-%d"), "portfolio_value": round(val, 2)})
        logger.info("Portfolio history: %d data points", len(result))
        return result

    # ------------------------------------------------------------------
    # Holdings (current)
    # ------------------------------------------------------------------

    def get_current_holdings(self, account_id: str) -> List[Dict]:
        """Return current holdings with symbol, quantity, avg_cost."""
        aid = account_id
        data = self._get_json(f"api/v0.1/accounts/{aid}/holdings")
        holdings = data if isinstance(data, list) else data.get("holdings", [])
        result = []
        for h in holdings:
            result.append({
                "symbol": h.get("symbol", ""),
                "quantity": float(h.get("quantity", 0)),
                "avg_cost": float(h.get("average_cost", h.get("avg_cost", 0))),
            })
        return result

    # ------------------------------------------------------------------
    # Holding stats (includes cash as $USD and notional values)
    # ------------------------------------------------------------------

    def get_holding_stats(self, account_id: str) -> Dict:
        """Return holding-stats with per-holding notional values."""
        aid = account_id
        return self._get_json(f"api/v0.1/portfolio/accounts/{aid}/holding-stats")

    def get_cash_balance(self, account_id: str) -> float:
        """Extract cash balance from holding-stats ($USD entry)."""
        stats = self.get_holding_stats(account_id)
        for h in stats.get("holdings", []):
            if h.get("symbol") == "$USD":
                return float(h.get("notional_value", 0))
        return 0.0

    # ------------------------------------------------------------------
    # Total stats
    # ------------------------------------------------------------------

    def get_total_stats(self, account_id: str) -> Dict:
        """Get aggregate stats: portfolio_value, net_deposits, returns, cash."""
        aid = account_id
        return self._get_json(f"api/v0.1/portfolio/accounts/{aid}/total-stats")

    # ------------------------------------------------------------------
    # Trade activity (CSV)
    # ------------------------------------------------------------------

    def get_trade_activity(self, account_id: str, since: str = "2020-01-01", until: str = None) -> List[Dict]:
        """Fetch all trade-activity rows as parsed dicts.

        Returns list of {date, symbol, action, quantity, price, total_amount, order_id}.
        """
        if until is None:
            until = datetime.now().strftime("%Y-%m-%d")
        aid = account_id
        csv_text = self._get_csv(
            f"api/v0.1/reports/{aid}",
            params={
                "since": f"{since}T00:00:00Z",
                "until": f"{until}T23:59:59Z",
                "report-type": "trade-activity",
            },
        )
        return self._parse_trade_csv(csv_text)

    def _parse_trade_csv(self, csv_text: str) -> List[Dict]:
        rows = []
        reader = csv.DictReader(io.StringIO(csv_text))
        for row in reader:
            symbol = row.get("Symbol", "").strip()
            side = row.get("Side", "").strip().lower()
            if not symbol or not side:
                continue
            qty = self._safe_float(row.get("Filled Quantity", row.get("Quantity", "")))
            price = self._safe_float(row.get("Average Fill Price", ""))
            total = self._safe_float(row.get("Filled Notional", ""))
            date_str = row.get("Filled Date/Time (America/New_York)", "")
            order_id = row.get("Order ID", "")
            rows.append({
                "date": date_str,
                "symbol": symbol,
                "action": side,
                "quantity": qty,
                "price": price,
                "total_amount": total,
                "order_id": order_id,
            })
        logger.info("Trade activity: %d rows", len(rows))
        return rows

    # ------------------------------------------------------------------
    # Non-trade activity (CSV) - deposits, fees, dividends
    # ------------------------------------------------------------------

    def get_non_trade_activity(self, account_id: str, since: str = "2020-01-01", until: str = None) -> List[Dict]:
        """Fetch non-trade-activity rows as parsed dicts.

        Returns list of {date, type, subtype, amount, description}.
        """
        if until is None:
            until = datetime.now().strftime("%Y-%m-%d")
        aid = account_id
        csv_text = self._get_csv(
            f"api/v0.1/reports/{aid}",
            params={
                "since": f"{since}T00:00:00Z",
                "until": f"{until}T23:59:59Z",
                "report-type": "non-trade-activity",
            },
        )
        return self._parse_non_trade_csv(csv_text)

    def _parse_non_trade_csv(self, csv_text: str) -> List[Dict]:
        rows = []
        reader = csv.DictReader(io.StringIO(csv_text))
        for row in reader:
            type_code = row.get("Type Code", "").strip()
            subtype = row.get("Subtype Code", "").strip()
            date_str = row.get("Settled Date (America/New_York)", "").strip()
            if not date_str or len(date_str) != 10:
                continue
            amount = self._safe_float(row.get("Net Amount", ""))
            desc = row.get("Description", row.get("Subtype Code", ""))
            rows.append({
                "date": date_str,
                "type": type_code,
                "subtype": subtype,
                "amount": amount,
                "description": desc,
            })
        logger.info("Non-trade activity: %d rows", len(rows))
        return rows

    # ------------------------------------------------------------------
    # Symphonies
    # ------------------------------------------------------------------

    def get_symphony_stats(self, account_id: str) -> List[Dict]:
        """Fetch active symphony stats for an account via symphony-stats-meta.

        Returns list of symphony dicts with id, name, value, net_deposits,
        simple_return, time_weighted_return, holdings, etc.
        """
        now = time.monotonic()
        cache_key = self._symphony_stats_cache_key(account_id)

        with _symphony_stats_cache_lock:
            cached = _symphony_stats_cache.get(cache_key)
            if cached:
                payload = cached.get("payload")
                fetched_at = float(cached.get("fetched_at", 0.0))
                cooldown_until = float(cached.get("cooldown_until", 0.0))
                if isinstance(payload, list):
                    if now - fetched_at <= _SYMPHONY_STATS_CACHE_TTL_SECONDS:
                        return payload
                    if now < cooldown_until:
                        return payload
                elif now < cooldown_until:
                    raise SymphonyStatsRateLimitError(
                        f"Symphony stats cooldown active for account {account_id}"
                    )

        try:
            data = self._get_json(f"api/v0.1/portfolio/accounts/{account_id}/symphony-stats-meta")
            symphonies = data.get("symphonies", [])
            if not isinstance(symphonies, list):
                symphonies = []
            fetched_at = time.monotonic()
            with _symphony_stats_cache_lock:
                _symphony_stats_cache[cache_key] = {
                    "payload": symphonies,
                    "fetched_at": fetched_at,
                    "cooldown_until": 0.0,
                }
                if len(_symphony_stats_cache) > _SYMPHONY_STATS_CACHE_MAX_ENTRIES:
                    oldest_key = min(
                        _symphony_stats_cache.keys(),
                        key=lambda key: float(_symphony_stats_cache[key].get("fetched_at", 0.0)),
                    )
                    _symphony_stats_cache.pop(oldest_key, None)
            logger.info("Symphony stats: %d symphonies for account %s", len(symphonies), account_id)
            return symphonies
        except requests.exceptions.HTTPError as exc:
            response = exc.response
            if response is None or response.status_code != 429:
                raise

            retry_after = self._parse_retry_after_seconds(response.headers.get("Retry-After"))
            cooldown_seconds = (
                retry_after
                if retry_after is not None and retry_after > 0
                else _SYMPHONY_STATS_RATE_LIMIT_COOLDOWN_SECONDS
            )
            observed_at = time.monotonic()
            cooldown_until = observed_at + cooldown_seconds

            warm_cache = False
            with _symphony_stats_cache_lock:
                cached = _symphony_stats_cache.get(cache_key)
                cached_payload = cached.get("payload") if cached else None
                warm_cache = isinstance(cached_payload, list)
                cached_fetched_at = (
                    float(cached.get("fetched_at", observed_at))
                    if cached and warm_cache
                    else observed_at
                )
                _symphony_stats_cache[cache_key] = {
                    "payload": cached_payload,
                    "fetched_at": cached_fetched_at,
                    "cooldown_until": cooldown_until,
                }

            if warm_cache:
                logger.warning(
                    "Symphony stats rate-limited for account %s; using cached payload for %.1fs",
                    account_id,
                    cooldown_seconds,
                )
                return cached_payload

            logger.warning(
                "Symphony stats rate-limited for account %s without cache; raising for %.1fs",
                account_id,
                cooldown_seconds,
            )
            raise SymphonyStatsRateLimitError(
                f"Symphony stats rate-limited for account {account_id}"
            ) from exc

    def get_symphony_history(self, account_id: str, symphony_id: str) -> List[Dict]:
        """Fetch daily value history for a specific symphony.

        Returns list of {'date': 'YYYY-MM-DD', 'value': float, 'deposit_adjusted_value': float}.
        """
        data = self._get_json(
            f"api/v0.1/portfolio/accounts/{account_id}/symphonies/{symphony_id}"
        )
        epochs = data.get("epoch_ms", [])
        values = data.get("series", [])
        dep_adj = data.get("deposit_adjusted_series", [])

        if len(epochs) != len(values):
            raise ValueError("symphony history length mismatch")

        result = []
        for i, (ts_ms, val) in enumerate(zip(epochs, values)):
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            result.append({
                "date": dt.strftime("%Y-%m-%d"),
                "value": round(val, 2),
                "deposit_adjusted_value": round(dep_adj[i], 2) if i < len(dep_adj) else round(val, 2),
            })
        logger.info("Symphony history: %d data points for %s", len(result), symphony_id)
        return result

    def get_symphony_versions(self, symphony_id: str) -> List[Dict]:
        """Fetch version history for a symphony.

        Returns list of version dicts (newest first) with created_at timestamps.
        Used to detect if a symphony has been modified since a cached backtest.
        """
        try:
            data = self._get_json(f"api/v0.1/symphonies/{symphony_id}/versions")
            versions = data if isinstance(data, list) else data.get("versions", [])
            return versions
        except Exception as e:
            logger.warning("Failed to fetch versions for %s: %s", symphony_id, e)
            return []

    def get_symphony_score(self, symphony_id: str) -> Dict:
        """Fetch the full symphony structure/definition via the score endpoint.

        Returns the complete logic tree, nodes, and configuration.
        """
        try:
            data = self._get_json(f"api/v0.1/symphonies/{symphony_id}/score")
            return data
        except Exception as e:
            logger.warning("Failed to fetch score for %s: %s", symphony_id, e)
            return {}

    def get_symphony_backtest(self, symphony_id: str) -> Dict:
        """Run backtest for an existing symphony.

        Returns the full backtest response with dvm_capital, stats, benchmarks, etc.

        Slippage & spread parameters:
          - slippage_percent: 0.0005 (5 bps)  - Composer default is 1 bps (0.0001)
          - spread_markup:    0.001  (10 bps)  - Composer default is 0
          Our more conservative friction (5 bps/trade vs Composer's 1 bps) better
          approximates real-world execution costs.  This means backtest results from
          this app will be slightly lower than Composer's UI for the same period
          (typically 3-5 pp over several months for active strategies).
        """
        url = f"{self.base_url}/api/v0.1/symphonies/{symphony_id}/backtest"
        resp = requests.post(url, headers=self.headers, json={
            "capital": 10000,
            "apply_reg_fee": True,
            "apply_taf_fee": True,
            "apply_subscription": "none",
            "backtest_version": "v2",
            "slippage_percent": 0.0005,
            "spread_markup": 0.001,
        }, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error(
                "RATE LIMITED (429) on POST backtest %s - Retry-After: %s",
                symphony_id, retry_after,
            )
        if not resp.ok:
            logger.error(
                "Backtest %s failed (%s): %s",
                symphony_id, resp.status_code, resp.text[:500],
            )
        resp.raise_for_status()
        data = resp.json()
        logger.info("Symphony backtest complete for %s", symphony_id)
        return data

    # ------------------------------------------------------------------
    # Dry Run / Trade Preview
    # ------------------------------------------------------------------

    def dry_run(self, account_uuids: List[str] = None) -> List[Dict]:
        """Run dry-run rebalance preview for all symphonies across accounts.

        Returns list of per-account results with dry_run_result keyed by symphony ID.
        """
        url = f"{self.base_url}/api/v0.1/dry-run"
        body = {"send_segment_event": False}
        if account_uuids:
            body["account_uuids"] = account_uuids
        resp = requests.post(url, headers=self.headers, json=body, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error("RATE LIMITED (429) on POST dry-run - Retry-After: %s", retry_after)
        if not resp.ok:
            logger.error("Dry-run failed (%s): %s", resp.status_code, resp.text[:500])
        resp.raise_for_status()
        data = resp.json()
        logger.info("Dry-run complete: %d account results", len(data))
        return data

    def get_trade_preview(self, symphony_id: str, broker_account_uuid: str = None) -> Dict:
        """Get trade preview for a single symphony.

        Returns preview with recommended_trades, next_rebalance_after, etc.
        """
        url = f"{self.base_url}/api/v0.1/dry-run/trade-preview/{symphony_id}"
        body: Dict = {}
        if broker_account_uuid:
            body["broker_account_uuid"] = broker_account_uuid
        resp = requests.post(url, headers=self.headers, json=body, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error("RATE LIMITED (429) on POST trade-preview %s - Retry-After: %s", symphony_id, retry_after)
        if not resp.ok:
            logger.error("Trade preview %s failed (%s): %s", symphony_id, resp.status_code, resp.text[:500])
        resp.raise_for_status()
        data = resp.json()
        logger.info("Trade preview complete for symphony %s", symphony_id)
        return data

    # ------------------------------------------------------------------
    # Watchlist & Drafts (backtest-api subdomain)
    # NOTE: These endpoints use the same API key id + API secret, but require
    # an x-origin header (public-api).
    # ------------------------------------------------------------------

    @property
    def _backtest_api_base(self) -> str:
        """Derive the backtest-api base URL from the main base URL."""
        return self.base_url.replace("://api.", "://backtest-api.")

    def get_watchlist(self) -> List[Dict]:
        """Fetch the user's watchlisted symphonies from backtest-api.

        Returns list of dicts with at least 'id' and 'name' keys.
        """
        url = f"{self._backtest_api_base}/api/v1/watchlist"
        resp = requests.get(url, headers=self.headers, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error(
                "RATE LIMITED (429) on GET watchlist - Retry-After: %s, body: %s",
                retry_after,
                resp.text[:500],
            )
        resp.raise_for_status()
        data = resp.json()
        items = data if isinstance(data, list) else data.get("symphonies", data.get("items", []))
        logger.info("Watchlist: %d symphonies", len(items))
        return items

    def get_drafts(self) -> List[Dict]:
        """Fetch the user's draft symphonies from backtest-api.

        Returns list of dicts with at least 'id' and 'name' keys.
        """
        url = f"{self._backtest_api_base}/api/v1/user/symphonies/drafts"
        resp = requests.get(url, headers=self.headers, timeout=_DEFAULT_HTTP_TIMEOUT)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "unknown")
            logger.error(
                "RATE LIMITED (429) on GET drafts - Retry-After: %s, body: %s",
                retry_after,
                resp.text[:500],
            )
        resp.raise_for_status()
        data = resp.json()
        items = data if isinstance(data, list) else data.get("symphonies", data.get("items", []))
        logger.info("Drafts: %d symphonies", len(items))
        return items
    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_float(value, default=0.0) -> float:
        try:
            return float(value) if value and str(value).strip() else default
        except (ValueError, TypeError):
            return default


def _clear_symphony_stats_cache_for_tests() -> None:
    """Clear in-memory symphony stats cache for deterministic unit tests."""
    with _symphony_stats_cache_lock:
        _symphony_stats_cache.clear()
