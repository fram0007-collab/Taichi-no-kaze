"""
Read-only connection into the SAME Postgres database the backend/worker use.
This service never writes to zones/snapshots/alerts — it only reads history
to train on, and reads the latest snapshot rows to make live predictions.
"""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

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
        _engine = create_engine(sync_url, poolclass=NullPool, echo=False)
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
