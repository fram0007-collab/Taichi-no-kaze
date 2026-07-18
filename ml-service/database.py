"""
Read-only connection into the SAME Postgres database the backend/worker use.
This service never writes to zones/snapshots/alerts — it only reads history
to train on, and reads the latest snapshot rows to make live predictions.
"""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL

logger = logging.getLogger("ml_service.database")

# NOTE: connection is created lazily (not at import time) so this module —
# and everything that imports it, like features.py — can still be imported
# for testing (test_offline.py) without a DATABASE_URL configured.
_engine = None
_SessionLocal = None


def _ensure_engine():
    global _engine, _SessionLocal
    if _engine is None:
        if not DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL not set. Copy .env.example to .env and fill it in with "
                "the same database backend/worker use (sync driver, no +asyncpg)."
            )
        sync_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        # Reuse connections across the many run_query() calls a single
        # training run makes (build_resolution_training_dataset alone makes
        # ~5 queries PER ZONE). A small reusable pool means only the first
        # few queries pay the TCP+TLS+auth handshake cost — everything after
        # reuses an existing connection. Without this (previously: NullPool),
        # every single query paid that cost from scratch, which across many
        # zones was slow enough to blow past the GitHub Actions job timeout.
        _engine = create_engine(
            sync_url,
            pool_size=5,
            max_overflow=5,
            pool_pre_ping=True,  # detects a dropped/stale connection and reconnects rather than erroring
            echo=False,
        )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def get_db_session():
    _ensure_engine()
    return _SessionLocal()


def run_query(sql: str, params: dict | None = None):
    """Run a read-only SQL query and return a list of dict rows."""
    engine = _ensure_engine()
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        cols = result.keys()
        return [dict(zip(cols, row)) for row in result.fetchall()]
