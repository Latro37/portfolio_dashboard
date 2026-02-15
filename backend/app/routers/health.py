"""Health check and Finnhub proxy routes."""

import os

from fastapi import APIRouter, Depends, Query, WebSocket
from fastapi.responses import PlainTextResponse

from app.security import require_local_auth, require_local_ws_auth
from app.services.health_proxy import get_finnhub_quote_proxy_data, proxy_finnhub_ws
router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    return {"status": "ok"}


@router.get("/api/user-guide", response_class=PlainTextResponse)
def user_guide():
    """Serve the README.md (user guide) documentation file."""
    md_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "README.md")
    md_path = os.path.abspath(md_path)
    with open(md_path, "r", encoding="utf-8") as f:
        return f.read()


@router.get("/api/metrics-guide", response_class=PlainTextResponse)
def metrics_guide():
    """Serve the METRICS.md documentation file."""
    md_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "METRICS.md")
    md_path = os.path.abspath(md_path)
    with open(md_path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Finnhub proxy — keeps the API key server-side
# ---------------------------------------------------------------------------

@router.get("/api/finnhub/quote")
def finnhub_quote_proxy(
    symbols: str = Query(..., description="Comma-separated ticker symbols"),
    _auth: None = Depends(require_local_auth),
):
    return get_finnhub_quote_proxy_data(symbols)


@router.websocket("/api/finnhub/ws")
async def finnhub_ws_proxy(
    websocket: WebSocket,
    _auth: None = Depends(require_local_ws_auth),
):
    await proxy_finnhub_ws(websocket)
