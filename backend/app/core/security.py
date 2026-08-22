"""Security utilities for password hashing and JSON Web Token (JWT) management.

This module provides cryptographic routines using passlib (bcrypt) for secure credential
storage and python-jose for encoding and decoding signed JWT authentication tokens.
"""

from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt, JWTError

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt.

    Args:
        password: Raw plaintext password string.

    Returns:
        str: Bcrypt salted password hash suitable for persistent storage.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a candidate plaintext password against a stored bcrypt hash.

    Args:
        plain_password: Raw plaintext password to verify.
        hashed_password: Stored bcrypt hash string.

    Returns:
        bool: True if the candidate password matches the hash, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    """Generate a signed JWT access token for an authenticated subject.

    Args:
        subject: Unique identifier of the authenticated entity (typically User UUID string).

    Returns:
        str: Encoded and cryptographically signed JWT token string.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Decode and validate a signed JWT access token.

    Args:
        token: Raw JWT access token string.

    Returns:
        str | None: The subject (UUID string) extracted from the token payload,
            or None if the token is invalid, expired, or signature verification fails.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except JWTError:
        return None