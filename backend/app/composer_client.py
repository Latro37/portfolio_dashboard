"""Clean Composer API client for fetching portfolio data."""

import csv
import io
import logging
from datetime import datetime
from typing import Dict, List, Optional

import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


class ComposerClient:
    """Thin wrapper around the Composer Trade API."""

    def __init__(self, settings=None):
        s = settings or get_settings()
        self.base_url = s.composer_api_base_url
        self.account_id = s.composer_account_id
        self.headers = {
            "x-api-key-id": s.composer_api_key_id,
            "Authorization": f"Bearer {s.composer_api_secret}",
            "accept": "application/json",
        }

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    def _get_json(self, endpoint: str, params: dict = None) -> dict:
        url = f"{self.base_url}/{endpoint}"
        resp = requests.get(url, headers=self.headers, params=params)
        resp.raise_for_status()
        return resp.json()

    def _get_csv(self, endpoint: str, params: dict = None) -> str:
        url = f"{self.base_url}/{endpoint}"
        hdrs = {**self.headers, "accept": "text/csv"}
        resp = requests.get(url, headers=hdrs, params=params)
        resp.raise_for_status()
        return resp.text

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------

    def get_account_id(self) -> str:
        """Return the configured account id, or discover the first one."""
        if self.account_id:
            return self.account_id
        data = self._get_json("api/v0.1/accounts/list")
        accounts = data if isinstance(data, list) else data.get("accounts", [])
        if not accounts:
            raise RuntimeError("No Composer accounts found")
        self.account_id = accounts[0].get("account_uuid", accounts[0].get("id", ""))
        return self.account_id

    # ------------------------------------------------------------------
    # Portfolio history (daily values)
    # ------------------------------------------------------------------

    def get_portfolio_history(self) -> List[Dict]:
        """Fetch daily portfolio values from the portfolio-history endpoint.

        Returns list of {'date': 'YYYY-MM-DD', 'portfolio_value': float} sorted by date.
        """
        aid = self.get_account_id()
        data = self._get_json(f"api/v0.1/portfolio/accounts/{aid}/portfolio-history")

        epochs = data.get("epoch_ms", [])
        values = data.get("series", [])
        if len(epochs) != len(values):
            raise ValueError("portfolio-history length mismatch")

        result = []
        for ts_ms, val in zip(epochs, values):
            dt = datetime.fromtimestamp(ts_ms / 1000)
            result.append({"date": dt.strftime("%Y-%m-%d"), "portfolio_value": round(val, 2)})
        logger.info("Portfolio history: %d data points", len(result))
        return result

    # ------------------------------------------------------------------
    # Holdings (current)
    # ------------------------------------------------------------------

    def get_current_holdings(self) -> List[Dict]:
        """Return current holdings with symbol, quantity, avg_cost."""
        aid = self.get_account_id()
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

    def get_holding_stats(self) -> Dict:
        """Return holding-stats with per-holding notional values."""
        aid = self.get_account_id()
        return self._get_json(f"api/v0.1/portfolio/accounts/{aid}/holding-stats")

    def get_cash_balance(self) -> float:
        """Extract cash balance from holding-stats ($USD entry)."""
        stats = self.get_holding_stats()
        for h in stats.get("holdings", []):
            if h.get("symbol") == "$USD":
                return float(h.get("notional_value", 0))
        return 0.0

    # ------------------------------------------------------------------
    # Total stats
    # ------------------------------------------------------------------

    def get_total_stats(self) -> Dict:
        """Get aggregate stats: portfolio_value, net_deposits, returns, cash."""
        aid = self.get_account_id()
        return self._get_json(f"api/v0.1/portfolio/accounts/{aid}/total-stats")

    # ------------------------------------------------------------------
    # Trade activity (CSV)
    # ------------------------------------------------------------------

    def get_trade_activity(self, since: str = "2020-01-01", until: str = None) -> List[Dict]:
        """Fetch all trade-activity rows as parsed dicts.

        Returns list of {date, symbol, action, quantity, price, total_amount, order_id}.
        """
        if until is None:
            until = datetime.now().strftime("%Y-%m-%d")
        aid = self.get_account_id()
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
    # Non-trade activity (CSV) — deposits, fees, dividends
    # ------------------------------------------------------------------

    def get_non_trade_activity(self, since: str = "2020-01-01", until: str = None) -> List[Dict]:
        """Fetch non-trade-activity rows as parsed dicts.

        Returns list of {date, type, subtype, amount, description}.
        """
        if until is None:
            until = datetime.now().strftime("%Y-%m-%d")
        aid = self.get_account_id()
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
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_float(value, default=0.0) -> float:
        try:
            return float(value) if value and str(value).strip() else default
        except (ValueError, TypeError):
            return default
