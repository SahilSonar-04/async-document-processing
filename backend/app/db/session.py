"""Asynchronous database engine and session management.

This module initializes the asynchronous SQLAlchemy engine using asyncpg, defines the
session factory, and exposes an async generator dependency (`get_db`) for FastAPI route handlers.
"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core.config import settings
from app.db.base import Base  # noqa: F401

engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide an asynchronous database session with automatic transaction commit/rollback.

    Yields:
        AsyncSession: Active asynchronous database session.

    Raises:
        Exception: Any database exception triggers a transaction rollback before propagation.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
