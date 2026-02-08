"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, SessionLocal
from app.routers import portfolio, health
from app.config import load_accounts
from app.composer_client import ComposerClient
from app.models import Account

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _discover_accounts():
    """For each credential set in accounts.json, discover sub-accounts and persist to DB."""
    accounts_creds = load_accounts()
    db = SessionLocal()
    try:
        for creds in accounts_creds:
            client = ComposerClient.from_credentials(creds)
            try:
                subs = client.list_sub_accounts()
            except Exception as e:
                logger.error("Failed to discover sub-accounts for '%s': %s", creds.name, e)
                continue

            for sub in subs:
                display = f"{creds.name} — {sub['display_name']}"
                existing = db.query(Account).filter_by(id=sub["account_id"]).first()
                if existing:
                    existing.credential_name = creds.name
                    existing.account_type = sub["account_type"]
                    existing.display_name = display
                    existing.status = sub["status"]
                else:
                    db.add(Account(
                        id=sub["account_id"],
                        credential_name=creds.name,
                        account_type=sub["account_type"],
                        display_name=display,
                        status=sub["status"],
                    ))
                logger.info("Discovered sub-account: %s (%s)", display, sub["account_id"])

            # Rate limit: 1 req/sec between credential sets
            if len(accounts_creds) > 1:
                time.sleep(1)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables and discover accounts on startup."""
    init_db()
    try:
        _discover_accounts()
    except FileNotFoundError as e:
        logger.warning("Account discovery skipped: %s", e)
    except Exception as e:
        logger.error("Account discovery failed: %s", e, exc_info=True)
    yield


app = FastAPI(
    title="Composer Portfolio Visualizer",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(portfolio.router)
