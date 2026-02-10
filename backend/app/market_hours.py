"""US equity market hours utilities (Eastern Time)."""

from datetime import datetime, date, timedelta, time
import zoneinfo

ET = zoneinfo.ZoneInfo("America/New_York")

MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)
MARKET_CLOSE_BUFFER = time(16, 5)  # +5 min buffer for data delays


def now_et() -> datetime:
    """Current datetime in US Eastern."""
    return datetime.now(ET)


def is_weekday(d: date) -> bool:
    return d.weekday() < 5


def is_market_open() -> bool:
    """True during regular trading hours (9:30 AM – 4:00 PM ET, weekdays)."""
    dt = now_et()
    if dt.weekday() >= 5:
        return False
    t = dt.time()
    return MARKET_OPEN <= t < MARKET_CLOSE


def is_within_trading_session() -> bool:
    """True during market hours + 5 min buffer (9:30 AM – 4:05 PM ET, weekdays).

    Use this to gate auto-refresh calls that should only run while the
    market is open or just after close (to capture final data).
    """
    dt = now_et()
    if dt.weekday() >= 5:
        return False
    t = dt.time()
    return MARKET_OPEN <= t < MARKET_CLOSE_BUFFER


def is_after_close() -> bool:
    """True between market close (4:00 PM ET) and next market open (9:30 AM ET).

    This is the window for post-close tasks like allocation snapshots.
    """
    dt = now_et()
    if dt.weekday() >= 5:
        return False  # weekends handled separately
    t = dt.time()
    return t >= MARKET_CLOSE or t < MARKET_OPEN


def get_allocation_target_date() -> date:
    """Determine the effective trading date for allocation snapshots.

    Rules:
    - Between 4:00 PM and midnight ET → next calendar day
    - Between midnight and 9:30 AM ET → same calendar day (today)
    - If the target falls on a weekend, roll forward to Monday.

    Returns None if called during market hours (allocations shouldn't
    be captured then).
    """
    dt = now_et()
    t = dt.time()
    today = dt.date()

    if t >= MARKET_CLOSE:
        # After close → target is next calendar day
        target = today + timedelta(days=1)
    elif t < MARKET_OPEN:
        # Before open → target is today
        target = today
    else:
        # During market hours — not the right time for allocations
        return None

    # Roll forward past weekends
    while target.weekday() >= 5:
        target += timedelta(days=1)

    return target


def next_trading_day(d: date = None) -> date:
    """Return the next trading day after the given date (skips weekends)."""
    if d is None:
        d = now_et().date()
    d = d + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d
