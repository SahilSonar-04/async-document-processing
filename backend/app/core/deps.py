"""FastAPI dependency injection utilities for authentication and database sessions.

This module provides dependencies that resolve the currently authenticated user
from Bearer tokens in incoming HTTP requests.
"""

import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate JWT bearer token from request headers and resolve the corresponding User entity.

    Args:
        token: Bearer token extracted automatically from the Authorization header.
        db: Active asynchronous database session.

    Returns:
        User: SQLAlchemy model instance of the authenticated user.

    Raises:
        HTTPException: 401 Unauthorized if token is missing, expired, invalid,
            or if the user record does not exist in the database.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = decode_access_token(token)
    if not subject:
        raise credentials_error
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise credentials_error

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_error
    return user
