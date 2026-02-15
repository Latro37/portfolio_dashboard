"""Health-related proxy services (finnhub REST + WebSocket relay)."""

from __future__ import annotations

import asyncio
import logging

import requests
from fastapi import WebSocket, WebSocketDisconnect

from app.config import load_finnhub_key

logger = logging.getLogger(__name__)


def get_finnhub_quote_proxy_data(symbols: str) -> dict:
    """Proxy Finnhub quote requests so the API key never reaches the browser."""
    api_key = load_finnhub_key()
    if not api_key:
        return {}

    symbol_list = [item.strip().upper() for item in symbols.split(",") if item.strip()]
    result: dict = {}
    for symbol in symbol_list[:50]:
        try:
            resp = requests.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": api_key},
                timeout=5,
            )
            if resp.ok:
                result[symbol] = resp.json()
        except Exception:
            pass
    return result


async def proxy_finnhub_ws(websocket: WebSocket) -> None:
    """Relay Finnhub WebSocket messages while keeping the API key server-side."""
    import websockets

    api_key = load_finnhub_key()
    if not api_key:
        await websocket.close(code=4000, reason="Finnhub API key not configured")
        return

    await websocket.accept()
    upstream_url = f"wss://ws.finnhub.io?token={api_key}"

    try:
        async with websockets.connect(upstream_url) as upstream:
            async def client_to_upstream() -> None:
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream.send(data)
                except WebSocketDisconnect:
                    pass

            async def upstream_to_client() -> None:
                try:
                    async for message in upstream:
                        await websocket.send_text(message)
                except Exception:
                    pass

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception as exc:
        logger.debug("Finnhub WS proxy closed: %s", exc)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
