from __future__ import annotations

import pytest
from starlette.websockets import WebSocketDisconnect


def test_finnhub_quote_requires_auth_token(client):
    res = client.get("/api/finnhub/quote?symbols=AAPL")
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid local auth token"


def test_finnhub_quote_rejects_cross_origin(client, auth_headers):
    res = client.get(
        "/api/finnhub/quote?symbols=AAPL",
        headers={**auth_headers, "Origin": "https://evil.example"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Origin not allowed"


def test_finnhub_ws_requires_allowed_origin(client):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect("/api/finnhub/ws?local_token=contract-test-token"):
            pass
    assert excinfo.value.code == 1008


def test_finnhub_ws_rejects_invalid_token(client):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            "/api/finnhub/ws?local_token=wrong-token",
            headers={"Origin": "http://localhost:3000"},
        ):
            pass
    assert excinfo.value.code == 1008
