"""Health check and Finnhub proxy routes."""

import asyncio
import json
import logging
import os
from typing import List, Optional

import requests
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse

from app.config import load_finnhub_key

logger = logging.getLogger(__name__)
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
):
    """Proxy Finnhub quote requests so the API key never reaches the browser."""
    api_key = load_finnhub_key()
    if not api_key:
        return {}
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    result = {}
    for sym in symbol_list[:50]:  # cap at 50 symbols
        try:
            resp = requests.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": sym, "token": api_key},
                timeout=5,
            )
            if resp.ok:
                result[sym] = resp.json()
        except Exception:
            pass
    return result


@router.websocket("/api/finnhub/ws")
async def finnhub_ws_proxy(websocket: WebSocket):
    """WebSocket relay to Finnhub — client subscribes via this proxy,
    the server holds the API key and forwards messages in both directions."""
    import websockets

    api_key = load_finnhub_key()
    if not api_key:
        await websocket.close(code=4000, reason="Finnhub API key not configured")
        return

    await websocket.accept()

    upstream_url = f"wss://ws.finnhub.io?token={api_key}"
    try:
        async with websockets.connect(upstream_url) as upstream:
            async def client_to_upstream():
                """Forward subscribe/unsubscribe messages from browser to Finnhub."""
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream.send(data)
                except WebSocketDisconnect:
                    pass

            async def upstream_to_client():
                """Forward trade data from Finnhub to browser."""
                try:
                    async for message in upstream:
                        await websocket.send_text(message)
                except Exception:
                    pass

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception as e:
        logger.debug("Finnhub WS proxy closed: %s", e)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
