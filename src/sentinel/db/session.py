"""
Async Database Session & Engine Configuration.
Provides connection pooling, dialect handling for SQLite/PostgreSQL, and session lifetimes.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from sentinel.config import get_settings
from sentinel.db.models import Base
from sentinel.logging import setup_logging

logger = setup_logging()

_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


async def reset_engine() -> None:
    """Disposes the current engine and resets the singleton for test isolation."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    _session_factory = None


def get_engine(database_url: Optional[str] = None) -> AsyncEngine:
    """Returns or creates the singleton async database engine."""
    global _engine
    if _engine is None:
        url = database_url or get_settings().database_url

        # SQLite requires connect_args for multithreaded / async access
        connect_args = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False

        _engine = create_async_engine(
            url,
            echo=False,
            future=True,
            connect_args=connect_args,
        )
        logger.info(f"Initialized database engine: {url.split('://')[0]}://***")
    return _engine


def get_session_factory(engine: Optional[AsyncEngine] = None) -> async_sessionmaker[AsyncSession]:
    """Returns or creates the singleton async session factory."""
    global _session_factory
    if _session_factory is None:
        eng = engine or get_engine()
        _session_factory = async_sessionmaker(
            bind=eng,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _session_factory


async def init_db(engine: Optional[AsyncEngine] = None) -> None:
    """Initializes tables in database (used for testing and local SQLite setup)."""
    eng = engine or get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schema initialized successfully.")


async def reset_db(engine: Optional[AsyncEngine] = None) -> None:
    """Drops and recreates all tables for pristine test isolation."""
    eng = engine or get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager yielding a managed database session with transaction safety."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Database transaction error: {e}")
        raise
    finally:
        await session.close()
