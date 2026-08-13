from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes.documents import router as documents_router


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Async Document Processing Workflow System",
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
