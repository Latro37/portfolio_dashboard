"""Localhost-focused request auth/origin guards for sensitive routes."""

from __future__ import annotations

import ipaddress
import os
import secrets
from typing import Optional

from fastapi import HTTPException, Request, WebSocket, WebSocketException, status

from app.config import get_settings, is_test_mode

LOCAL_AUTH_HEADER = "x-pd-local-token"
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
_DEFAULT_ALLOWED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
}
_TEST_ALLOWED_HOSTS = {"testserver"}
_runtime_local_auth_token = secrets.token_urlsafe(32)


def get_local_auth_token() -> str:
    """Return the expected local auth token.

    Priority:
    1) PD_LOCAL_AUTH_TOKEN env var
    2) config.json settings.local_auth_token
    3) runtime-generated process token
    """
    env_token = os.environ.get("PD_LOCAL_AUTH_TOKEN", "").strip()
    if env_token:
        return env_token

    settings_token = get_settings().local_auth_token.strip()
    if settings_token:
        return settings_token

    return _runtime_local_auth_token


def _normalize_host(host_header: str) -> str:
    host = host_header.strip().lower()
    if not host:
        return ""
    if host.startswith("["):
        end_idx = host.find("]")
        if end_idx != -1:
            return host[: end_idx + 1]
    return host.split(":", 1)[0]


def _is_loopback_host(value: str) -> bool:
    host = value.strip().strip("[]").lower()
    if host in {"localhost", "testserver"}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _allowed_hosts() -> set[str]:
    hosts = set(_DEFAULT_ALLOWED_HOSTS)
    if is_test_mode():
        hosts.update(_TEST_ALLOWED_HOSTS)
    return hosts


def _enforce_local_network_boundary(
    *,
    host_header: Optional[str],
    client_host: Optional[str],
    websocket: bool = False,
) -> None:
    if not is_test_mode():
        if not client_host or not _is_loopback_host(client_host):
            if websocket:
                raise WebSocketException(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason="Localhost client required",
                )
            raise HTTPException(403, "Localhost client required")

    parsed_host = _normalize_host(host_header or "")
    if parsed_host not in _allowed_hosts():
        if websocket:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Localhost host header required",
            )
        raise HTTPException(403, "Localhost host header required")


def _enforce_origin(
    *,
    origin: Optional[str],
    require_origin: bool,
    websocket: bool = False,
) -> None:
    normalized = (origin or "").strip().rstrip("/")
    if not normalized:
        if require_origin:
            if websocket:
                raise WebSocketException(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason="Origin header required",
                )
            raise HTTPException(403, "Origin header required")
        return

    if normalized not in ALLOWED_ORIGINS:
        if websocket:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Origin not allowed",
            )
        raise HTTPException(403, "Origin not allowed")


def _enforce_token(*, token: Optional[str], websocket: bool = False) -> None:
    expected = get_local_auth_token()
    provided = (token or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        if websocket:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid local auth token",
            )
        raise HTTPException(401, "Invalid local auth token")


def require_local_origin(request: Request) -> None:
    """Require localhost host/client and enforce browser Origin when provided."""
    _enforce_local_network_boundary(
        host_header=request.headers.get("host"),
        client_host=request.client.host if request.client else None,
    )
    _enforce_origin(origin=request.headers.get("origin"), require_origin=False)


def require_local_auth(request: Request) -> None:
    """Require localhost host/client + allowed origin + valid auth token."""
    require_local_origin(request)
    _enforce_token(
        token=request.headers.get(LOCAL_AUTH_HEADER) or request.query_params.get("local_token"),
    )


def require_local_ws_auth(websocket: WebSocket) -> None:
    """Require strict localhost + origin + token checks for browser WebSocket calls."""
    _enforce_local_network_boundary(
        host_header=websocket.headers.get("host"),
        client_host=websocket.client.host if websocket.client else None,
        websocket=True,
    )
    _enforce_origin(
        origin=websocket.headers.get("origin"),
        require_origin=True,
        websocket=True,
    )
    _enforce_token(
        token=websocket.query_params.get("local_token") or websocket.headers.get(LOCAL_AUTH_HEADER),
        websocket=True,
    )
