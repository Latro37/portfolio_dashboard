"""Market-data helpers (Stooq, Finnhub, Polygon)."""

from __future__ import annotations

import csv
import io
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Tuple

import requests

from app.config import load_finnhub_key, load_polygon_key

logger = logging.getLogger(__name__)

_FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
_STOOQ_DAILY_URL = "https://stooq.com/q/d/l/"
_POLYGON_SPLITS_URL = "https://api.polygon.io/v3/reference/splits"


class FinnhubError(RuntimeError):
    """Base exception for Finnhub API failures."""


class FinnhubAccessError(FinnhubError):
    """Raised when the configured key cannot access a Finnhub resource."""


class FinnhubNotConfiguredError(FinnhubAccessError):
    """Raised when no Finnhub key is configured."""


class PolygonError(RuntimeError):
    """Base exception for Polygon API failures."""


class PolygonAccessError(PolygonError):
    """Raised when Polygon denies access to a resource."""


class PolygonNotConfiguredError(PolygonAccessError):
    """Raised when no Polygon key is configured."""


def get_daily_closes_stooq(symbol: str, start_date: date, end_date: date) -> List[Tuple[date, float]]:
    """Return daily closes from Stooq CSV for [start_date, end_date]."""
    symbol = symbol.strip().lower()
    if not symbol:
        return []

    d1 = start_date.strftime("%Y%m%d")
    d2 = end_date.strftime("%Y%m%d")
    candidates = [f"{symbol}.us", symbol]

    for stooq_symbol in candidates:
        try:
            resp = requests.get(
                _STOOQ_DAILY_URL,
                params={"s": stooq_symbol, "d1": d1, "d2": d2, "i": "d"},
                timeout=20,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning("Stooq request failed for %s: %s", stooq_symbol, e)
            continue

        txt = (resp.text or "").strip()
        if not txt or txt.lower().startswith("no data"):
            continue

        rows_by_date: Dict[date, float] = {}
        reader = csv.DictReader(io.StringIO(txt))
        for row in reader:
            ds = (row.get("Date") or "").strip()
            cs = (row.get("Close") or "").strip()
            if not ds or not cs:
                continue
            try:
                d = date.fromisoformat(ds)
                if d < start_date or d > end_date:
                    continue
                c = float(cs)
            except Exception:
                continue
            rows_by_date[d] = c

        rows = sorted(rows_by_date.items(), key=lambda x: x[0])
        if rows:
            logger.debug("Stooq candles %s: %d rows", stooq_symbol, len(rows))
            return rows

    return []


def get_splits_polygon(symbol: str, start_date: date, end_date: date) -> List[Tuple[date, float]]:
    """Return split events as (date, quantity_multiplier) from Polygon."""
    symbol = symbol.strip().upper()
    if not symbol:
        return []

    key = load_polygon_key()
    if not key:
        raise PolygonNotConfiguredError("Polygon API key is not configured.")

    url = _POLYGON_SPLITS_URL
    params: Dict[str, object] | None = {
        "ticker": symbol,
        "execution_date.gte": start_date.isoformat(),
        "execution_date.lte": end_date.isoformat(),
        "order": "asc",
        "sort": "execution_date",
        "limit": 1000,
        "apiKey": key,
    }

    raw_rows: List[dict] = []
    pages = 0
    while url and pages < 10:
        pages += 1
        try:
            resp = requests.get(url, params=params, timeout=20)
        except requests.RequestException as e:
            raise PolygonError(f"Polygon request failed: {e}") from e
        params = None

        payload = None
        try:
            payload = resp.json()
        except Exception:
            payload = None

        if resp.status_code in (401, 403):
            msg = "Polygon denied access to this resource."
            if isinstance(payload, dict):
                msg = str(payload.get("error") or payload.get("message") or msg)
            raise PolygonAccessError(msg)
        if not resp.ok:
            msg = f"Polygon returned HTTP {resp.status_code}"
            if isinstance(payload, dict):
                msg = str(payload.get("error") or payload.get("message") or msg)
            raise PolygonError(msg)
        if not isinstance(payload, dict):
            raise PolygonError("Unexpected Polygon split response format.")

        status = str(payload.get("status", "")).upper()
        if status not in ("OK",):
            err_msg = str(payload.get("error") or payload.get("message") or f"Polygon split status: {status}")
            raise PolygonError(err_msg)

        results = payload.get("results")
        if isinstance(results, list):
            raw_rows.extend([r for r in results if isinstance(r, dict)])

        next_url = payload.get("next_url")
        if isinstance(next_url, str) and next_url:
            if "apiKey=" not in next_url:
                sep = "&" if "?" in next_url else "?"
                next_url = f"{next_url}{sep}apiKey={key}"
            url = next_url
        else:
            url = ""

    out: List[Tuple[date, float]] = []
    for item in raw_rows:
        ds = item.get("execution_date") or item.get("date")
        split_from = item.get("split_from") if item.get("split_from") is not None else item.get("fromFactor")
        split_to = item.get("split_to") if item.get("split_to") is not None else item.get("toFactor")
        try:
            d = date.fromisoformat(str(ds))
            ff = float(split_from)
            tf = float(split_to)
            if ff <= 0 or tf <= 0:
                continue
            ratio = tf / ff
        except Exception:
            continue
        if ratio > 0:
            out.append((d, ratio))

    out.sort(key=lambda x: x[0])
    logger.debug("Polygon splits %s: %d events", symbol, len(out))
    return out


def _request_json(path: str, params: Dict[str, object], timeout: int = 20):
    key = load_finnhub_key()
    if not key:
        raise FinnhubNotConfiguredError("Finnhub API key is not configured.")

    req_params = dict(params)
    req_params["token"] = key

    try:
        resp = requests.get(f"{_FINNHUB_BASE_URL}{path}", params=req_params, timeout=timeout)
    except requests.RequestException as e:
        raise FinnhubError(f"Finnhub request failed: {e}") from e

    payload = None
    try:
        payload = resp.json()
    except Exception:
        payload = None

    if resp.status_code == 403:
        if isinstance(payload, dict) and payload.get("error"):
            raise FinnhubAccessError(str(payload["error"]))
        raise FinnhubAccessError("Finnhub denied access to this resource.")

    if not resp.ok:
        msg = f"Finnhub returned HTTP {resp.status_code}"
        if isinstance(payload, dict) and payload.get("error"):
            msg = str(payload["error"])
        raise FinnhubError(msg)

    if isinstance(payload, dict) and payload.get("error"):
        msg = str(payload["error"])
        if "access" in msg.lower():
            raise FinnhubAccessError(msg)
        raise FinnhubError(msg)

    return payload


def get_daily_closes(symbol: str, start_date: date, end_date: date) -> List[Tuple[date, float]]:
    """Return daily closes from Finnhub stock candles for [start_date, end_date]."""
    symbol = symbol.strip().upper()
    if not symbol:
        return []

    start_ts = int(datetime.combine(start_date, time.min, tzinfo=timezone.utc).timestamp())
    end_ts = int(datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc).timestamp()) - 1

    data = _request_json(
        "/stock/candle",
        {
            "symbol": symbol,
            "resolution": "D",
            "from": start_ts,
            "to": end_ts,
        },
    )

    if not isinstance(data, dict):
        raise FinnhubError("Unexpected Finnhub candle response format.")

    status = str(data.get("s", "")).lower()
    if status == "no_data":
        return []
    if status != "ok":
        raise FinnhubError(f"Finnhub candle response status: {data.get('s')!r}")

    ts_series = data.get("t") or []
    close_series = data.get("c") or []
    if not isinstance(ts_series, list) or not isinstance(close_series, list):
        raise FinnhubError("Finnhub candle payload missing time/close arrays.")

    rows_by_date: Dict[date, float] = {}
    for ts, close_val in zip(ts_series, close_series):
        try:
            d = datetime.fromtimestamp(int(ts), tz=timezone.utc).date()
            c = float(close_val)
        except Exception:
            continue
        if start_date <= d <= end_date:
            rows_by_date[d] = c

    rows = sorted(rows_by_date.items(), key=lambda x: x[0])
    logger.debug("Finnhub candles %s: %d rows", symbol, len(rows))
    return rows


def get_latest_price(symbol: str) -> float | None:
    """Return the latest Finnhub quote price for a symbol, if available."""
    symbol = symbol.strip().upper()
    if not symbol:
        return None

    data = _request_json("/quote", {"symbol": symbol}, timeout=10)
    if not isinstance(data, dict):
        return None

    try:
        price = float(data.get("c", 0))
    except Exception:
        return None

    return price if price > 0 else None


def get_splits(symbol: str, start_date: date, end_date: date) -> List[Tuple[date, float]]:
    """Return split events as (date, quantity_multiplier) from Finnhub."""
    symbol = symbol.strip().upper()
    if not symbol:
        return []

    data = _request_json(
        "/stock/split",
        {
            "symbol": symbol,
            "from": start_date.isoformat(),
            "to": end_date.isoformat(),
        },
    )

    if not isinstance(data, list):
        raise FinnhubError("Unexpected Finnhub split response format.")

    out: List[Tuple[date, float]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        ds = item.get("date")
        from_factor = item.get("fromFactor")
        to_factor = item.get("toFactor")
        try:
            d = date.fromisoformat(str(ds))
            ff = float(from_factor)
            tf = float(to_factor)
            if ff <= 0 or tf <= 0:
                continue
            # Finnhub split payload expresses "from X shares to Y shares".
            ratio = tf / ff
        except Exception:
            continue
        if ratio > 0:
            out.append((d, ratio))

    out.sort(key=lambda x: x[0])
    logger.debug("Finnhub splits %s: %d events", symbol, len(out))
    return out
