"""Health check route."""

import os
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    return {"status": "ok"}


@router.get("/api/metrics-guide", response_class=PlainTextResponse)
def metrics_guide():
    """Serve the METRICS.md documentation file."""
    md_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "METRICS.md")
    md_path = os.path.abspath(md_path)
    with open(md_path, "r", encoding="utf-8") as f:
        return f.read()
