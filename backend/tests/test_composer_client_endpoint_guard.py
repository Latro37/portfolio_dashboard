from __future__ import annotations

import re
from pathlib import Path


_COMPOSER_CLIENT_PATH = Path(__file__).resolve().parent.parent / "app" / "composer_client.py"
_BLOCKED_ENDPOINT_PATTERNS = (
    "/orders",
    "/order/",
    "/rebalance/",
    "/execute",
    "/place-order",
    "/submit-order",
)


def _extract_api_endpoints(source: str) -> list[str]:
    endpoints = re.findall(r"/api/v[0-9][0-9.]*/[A-Za-z0-9._~!$&'()*+,;=:@%/{}-]+", source)
    return sorted(set(endpoints))


def test_composer_client_endpoint_guard_has_api_surface():
    source = _COMPOSER_CLIENT_PATH.read_text(encoding="utf-8")
    endpoints = _extract_api_endpoints(source)
    assert endpoints, "No Composer API endpoints found; endpoint guard cannot validate behavior."


def test_composer_client_endpoint_guard_blocks_order_placement_paths():
    source = _COMPOSER_CLIENT_PATH.read_text(encoding="utf-8")
    endpoints = _extract_api_endpoints(source)
    violations = [
        endpoint
        for endpoint in endpoints
        if any(blocked in endpoint.lower() for blocked in _BLOCKED_ENDPOINT_PATTERNS)
    ]
    assert not violations, (
        "Order-placement endpoint pattern detected in ComposerClient: "
        f"{', '.join(violations)}"
    )
