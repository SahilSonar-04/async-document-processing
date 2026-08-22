"""Authentication API endpoints for registration, login, and user profile resolution."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import TokenResponse, UserCreate, UserLogin, UserResponse

router = APIRouter()


@router.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new user account",
    description="Creates a new user record with a bcrypt hashed password.",
)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    """Register a new user account.

    Args:
        payload: Email and password registration credentials.
        db: Active asynchronous database session.

    Returns:
        User: Newly created User model instance.

    Raises:
        HTTPException: 400 if email is already registered.
    """
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/auth/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue JWT",
    description="Validates email and password, returning a signed JWT access token.",
)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Authenticate credentials and generate a signed access token.

    Args:
        payload: User login credentials.
        db: Active asynchronous database session.

    Returns:
        TokenResponse: Signed JWT access token and token type.

    Raises:
        HTTPException: 401 if credentials are invalid.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get(
    "/auth/me",
    response_model=UserResponse,
    summary="Get current user profile",
    description="Retrieves the profile of the authenticated user using Bearer token.",
)
async def me(current_user: User = Depends(get_current_user)) -> User:
    """Retrieve profile of the currently authenticated user.

    Args:
        current_user: Resolved User model from JWT Bearer dependency.

    Returns:
        User: Authenticated User model instance.
    """
    return current_user
