"""
Shared database connection helper for Vercel serverless functions.
Each function invocation gets a fresh connection — no persistent pool.
NullPool is used because serverless functions are stateless.
"""
import os
import json
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set")

# Strip sslmode from URL — asyncpg uses connect_args instead
_url = DATABASE_URL.replace("sslmode=require", "").replace("sslmode=prefer", "").rstrip("?&")
if not _url.startswith("postgresql+asyncpg://"):
    _url = _url.replace("postgresql://", "postgresql+asyncpg://", 1)

_use_ssl = "supabase.com" in DATABASE_URL

engine = create_async_engine(
    _url,
    poolclass=NullPool,  # no persistent pool — each invocation is isolated
    future=True,
    echo=False,
    connect_args={"ssl": "require", "statement_cache_size": 0} if _use_ssl
                 else {"statement_cache_size": 0},
    execution_options={"no_prepare": True},
)

AsyncSessionLocal = sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


@asynccontextmanager
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# CORS headers for all responses
CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("FRONTEND_URL", "*"),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
}


def cors_response(data, status=200):
    """Wrap response with CORS headers."""
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(data, default=str),
    }


def error_response(message="Internal server error", status=500):
    return cors_response({"error": message}, status)
