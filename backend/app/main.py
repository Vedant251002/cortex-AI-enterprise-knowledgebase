from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import audit as audit_api
from app.api import auth as auth_api
from app.api import chat as chat_api
from app.api import documents as documents_api
from app.api import usage as usage_api
from app.core.config import get_settings
from app.core.logging import configure_app_insights, configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    configure_app_insights(settings.applicationinsights_connection_string)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Cortex - AI Enterprise Knowledge Assistant", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_api.router)
    app.include_router(documents_api.router)
    app.include_router(chat_api.router)
    app.include_router(usage_api.router)
    app.include_router(audit_api.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
