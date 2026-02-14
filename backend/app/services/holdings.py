"""Reconstruct historical holdings by replaying trade-activity transactions."""

import logging
from datetime import date, datetime
from typing import Dict, List

from app.services.finnhub_market_data import (
    FinnhubAccessError,
    FinnhubError,
    PolygonAccessError,
    PolygonError,
    PolygonNotConfiguredError,
    get_splits,
    get_splits_polygon,
)

logger = logging.getLogger(__name__)

# Date formats found in Composer trade-activity CSV
_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S.%f%z",
    "%Y-%m-%d %H:%M:%S%z",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S%z",
]


def _parse_date(date_str: str):
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def get_splits_by_date(symbols: List[str], since: str = "2020-01-01") -> Dict[str, List]:
    """Fetch stock split history from Finnhub.

    Returns {date_str: [(symbol, ratio), ...]}.
    """
    splits_by_date: Dict[str, list] = {}
    try:
        since_date = date.fromisoformat(since[:10])
    except Exception:
        since_date = date(2020, 1, 1)
    end_date = datetime.now().date()

    finnhub_warning_emitted = False
    polygon_warning_emitted = False
    for sym in symbols:
        events: List[tuple[date, float]] = []
        try:
            events = get_splits(sym, since_date, end_date)
        except FinnhubAccessError as e:
            if not finnhub_warning_emitted:
                logger.warning("Finnhub split data is unavailable: %s", e)
                finnhub_warning_emitted = True
        except FinnhubError:
            pass
        except Exception:
            pass

        if not events:
            try:
                events = get_splits_polygon(sym, since_date, end_date)
            except PolygonNotConfiguredError as e:
                if not polygon_warning_emitted:
                    logger.warning("Polygon split data is unavailable: %s", e)
                    polygon_warning_emitted = True
            except PolygonAccessError as e:
                if not polygon_warning_emitted:
                    logger.warning("Polygon split access denied: %s", e)
                    polygon_warning_emitted = True
            except PolygonError:
                pass
            except Exception:
                pass

        for dt, ratio in events:
            ds = dt.strftime("%Y-%m-%d")
            splits_by_date.setdefault(ds, []).append((sym, float(ratio)))
            logger.info("Split: %s x%.6f on %s", sym, float(ratio), ds)
    return splits_by_date


def reconstruct_holdings(
    transactions: List[Dict],
) -> List[Dict]:
    """Replay transactions to produce daily holdings snapshots.

    Each transaction dict must have: date, symbol, action, quantity.
    Returns list of {'date': 'YYYY-MM-DD', 'holdings': {symbol: qty, ...}}
    sorted by date.  Only dates with activity (trades or splits) are included.
    """
    # Group transactions by date
    tx_by_date: Dict[str, list] = {}
    for tx in transactions:
        d = _parse_date(tx.get("date", ""))
        if d:
            ds = d.strftime("%Y-%m-%d")
            tx_by_date.setdefault(ds, []).append(tx)

    # Gather unique symbols and fetch splits
    all_symbols = list({tx.get("symbol", "") for tx in transactions if tx.get("symbol")})
    earliest = min(tx_by_date.keys()) if tx_by_date else "2020-01-01"
    splits_by_date = get_splits_by_date(all_symbols, since=earliest)

    today_str = datetime.now().date().strftime("%Y-%m-%d")
    all_dates = sorted(d for d in set(tx_by_date) | set(splits_by_date) if d <= today_str)

    if not all_dates:
        return []

    holdings: Dict[str, float] = {}
    history: List[Dict] = []

    for ds in all_dates:
        # 1. Apply splits before trades
        if ds in splits_by_date:
            for sym, ratio in splits_by_date[ds]:
                if sym in holdings and abs(holdings[sym]) > 1e-6:
                    holdings[sym] *= ratio

        # 2. Apply trades
        if ds in tx_by_date:
            for tx in tx_by_date[ds]:
                sym = tx.get("symbol", "")
                action = tx.get("action", "")
                qty = float(tx.get("quantity", 0))
                if not sym or not action:
                    continue
                if action == "buy":
                    holdings[sym] = holdings.get(sym, 0) + qty
                elif action == "sell":
                    holdings[sym] = holdings.get(sym, 0) - qty
                    if sym in holdings and abs(holdings[sym]) < 1e-6:
                        del holdings[sym]

        snapshot = {s: round(q, 6) for s, q in holdings.items() if abs(q) > 1e-6}
        history.append({"date": ds, "holdings": snapshot})

    logger.info(
        "Reconstructed holdings: %d dates, %d final positions",
        len(history),
        len(history[-1]["holdings"]) if history else 0,
    )
    return history
