from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes.documents import router as documents_router
from app.api.routes.auth import router as auth_router
from app.api.routes.agent import router as agent_router


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Async Document Processing Workflow System",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
app.include_router(documents_router, prefix="/api/v1", tags=["documents"])
app.include_router(agent_router, prefix="/api/v1", tags=["agent"])
