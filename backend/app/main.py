"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import engine
from app.db.base import Base
import app.models.models  # noqa: F401 — register models with Base.metadata
from app.api.routes.documents import router as documents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup (dev convenience)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Async Document Processing Workflow System",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(documents_router, prefix="/api/v1", tags=["documents"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}
