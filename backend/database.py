import os
import logging
import time
import asyncio
from pathlib import Path
from typing import Optional, Any

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import event
from dotenv import load_dotenv

# Explicit path — works regardless of where uvicorn is launched from
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

logger = logging.getLogger("backend.database")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL not set. Make sure backend/.env exists with:\n"
        "  DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"
    )

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=300,
    future=True,
    echo=False,
)

AsyncSessionLocal = sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── SQL Metrics ───────────────────────────────────────────────────────────────
_sql_timestamps: list[float] = []

@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _track_sql(conn, cursor, statement, parameters, context, executemany):
    _sql_timestamps.append(time.time())

def get_sql_ops_metrics() -> dict:
    now = time.time()
    cutoff = now - 600
    _sql_timestamps[:] = [t for t in _sql_timestamps if t >= cutoff]
    return {
        "30s": sum(1 for t in _sql_timestamps if now - t <= 30),
        "60s": sum(1 for t in _sql_timestamps if now - t <= 60),
        "5m": sum(1 for t in _sql_timestamps if now - t <= 300),
    }


# ── TTL Cache ─────────────────────────────────────────────────────────────────
class TTLCache:
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self.default_ttl = ttl_seconds
        self._cache: dict[Any, tuple[Any, float]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: Any) -> Optional[Any]:
        async with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            value, ts = entry
            if time.time() - ts < self.ttl:
                return value
            del self._cache[key]
            return None

    async def set(self, key: Any, value: Any) -> None:
        async with self._lock:
            self._cache[key] = (value, time.time())

    async def delete(self, key: Any) -> None:
        async with self._lock:
            self._cache.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._cache.clear()

    async def size(self) -> int:
        async with self._lock:
            return len(self._cache)
