import os
import logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

# Load .env from THIS file's directory (worker/.env) regardless of CWD
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

logger = logging.getLogger("worker.database")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL not set. Make sure worker/.env exists with:\n"
        "  DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"
    )

_sync_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

engine = create_engine(_sync_url, poolclass=NullPool, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db_session():
    return SessionLocal()
