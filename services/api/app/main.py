from __future__ import annotations

import os
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app import __version__
from app.ai.config import AISettings
from app.ai.provider import QuizProvider, build_provider
from app.ai.tutor import TutorProvider, build_tutor_provider
from app.database import (
    Base,
    create_session_factory,
    migrate_flat_tag_uniqueness,
    migrate_deadline_tag_id,
    migrate_deadline_status,
    migrate_profile_fields,
    migrate_tag_colors,
    migrate_tutor_message_selection,
)
from app.models import AuthSession, Deadline, Document, Quiz, QuizAnswer, QuizAttempt, QuizQuestion, Tag, TutorAttachment, TutorConversation, TutorMessage, TutorMessageAttachment, User  # noqa: F401 — register model metadata.
from app.middleware.quiz_upload_guard import QuizUploadGuardMiddleware
from app.routers.auth import router as auth_router
from app.routers.ai import router as ai_router
from app.routers.documents import router as documents_router
from app.routers.deadlines import router as deadlines_router
from app.routers.dashboard import router as dashboard_router
from app.routers.health import router as health_router
from app.routers.profile import router as profile_router
from app.routers.progress import router as progress_router
from app.routers.quizzes import router as quizzes_router
from app.routers.tags import router as tags_router
from app.routers.tutor import router as tutor_router
from app.tags.catalog import seed_builtin_subjects


def _repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


def create_app(
    database_url: str | None = None,
    image_storage_dir: str | Path | None = None,
    document_storage_dir: str | Path | None = None,
    document_staging_dir: str | Path | None = None,
    tutor_attachment_storage_dir: str | Path | None = None,
    cookie_secure: bool | None = None,
    quiz_provider: QuizProvider | None = None,
    quiz_provider_factory: Callable[[str, str], QuizProvider] | None = None,
    ai_settings: AISettings | None = None,
    tutor_provider: TutorProvider | None = None,
    tutor_provider_factory: Callable[[str | None, str | None], TutorProvider] | None = None,
) -> FastAPI:
    if quiz_provider is not None and quiz_provider_factory is not None:
        raise ValueError("Provide either quiz_provider or quiz_provider_factory, not both")
    if tutor_provider is not None and tutor_provider_factory is not None:
        raise ValueError("Provide either tutor_provider or tutor_provider_factory, not both")

    data_dir = Path(os.environ.get("SYNAPSESYNC_DATA_DIR", _repository_root() / ".local"))
    resolved_database_url = database_url or f"sqlite:///{(data_dir / 'synapsesync.db').as_posix()}"
    resolved_image_storage_dir = Path(image_storage_dir) if image_storage_dir else data_dir / "profile-images"
    resolved_document_storage_dir = Path(document_storage_dir) if document_storage_dir else data_dir / "documents"
    resolved_document_staging_dir = Path(document_staging_dir) if document_staging_dir else data_dir / "document-staging"
    resolved_tutor_attachment_storage_dir = (
        Path(tutor_attachment_storage_dir)
        if tutor_attachment_storage_dir
        else data_dir / "tutor-attachments"
    )
    session_factory = create_session_factory(resolved_database_url)
    engine = session_factory.kw["bind"]

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        if engine.url.get_backend_name() == "sqlite" and engine.url.database not in (None, ":memory:"):
            Path(engine.url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        resolved_image_storage_dir.mkdir(parents=True, exist_ok=True)
        resolved_document_storage_dir.mkdir(parents=True, exist_ok=True)
        resolved_document_staging_dir.mkdir(parents=True, exist_ok=True)
        resolved_tutor_attachment_storage_dir.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
        migrate_profile_fields(engine)
        migrate_tag_colors(engine)
        migrate_flat_tag_uniqueness(engine)
        migrate_tutor_message_selection(engine)
        seed_builtin_subjects(session_factory)
        migrate_deadline_tag_id(engine)
        migrate_deadline_status(engine)
        yield
        engine.dispose()

    application = FastAPI(
        title="SynapseSync API",
        description="Modular Monolith API for the SynapseSync learning platform.",
        version=__version__,
        redoc_url=None,
        lifespan=lifespan,
    )
    application.state.session_factory = session_factory
    application.state.image_storage_dir = resolved_image_storage_dir
    application.state.document_storage_dir = resolved_document_storage_dir
    application.state.document_staging_dir = resolved_document_staging_dir
    application.state.tutor_attachment_storage_dir = resolved_tutor_attachment_storage_dir
    application.state.cookie_secure = cookie_secure
    resolved_ai_settings = ai_settings or AISettings.from_environment(Path(__file__).resolve().parent.parent)
    application.state.ai_settings = resolved_ai_settings
    application.state.quiz_provider = quiz_provider
    application.state.quiz_provider_factory = quiz_provider_factory or (
        lambda provider_id, model_id: build_provider(
            resolved_ai_settings,
            model_provider=provider_id,
            model=model_id,
        )
    )
    application.state.tutor_provider = tutor_provider
    application.state.tutor_provider_factory = tutor_provider_factory or (
        lambda provider_id, model_id: build_tutor_provider(
            resolved_ai_settings,
            provider_id=provider_id,
            model_id=model_id,
        )
    )
    application.add_middleware(
        QuizUploadGuardMiddleware,
        session_factory=session_factory,
    )
    application.include_router(health_router)
    application.include_router(health_router, prefix="/api")
    application.include_router(auth_router, prefix="/api")
    application.include_router(ai_router, prefix="/api")
    application.include_router(profile_router, prefix="/api")
    application.include_router(quizzes_router, prefix="/api")
    application.include_router(tags_router, prefix="/api")
    application.include_router(documents_router, prefix="/api")
    application.include_router(deadlines_router, prefix="/api")
    application.include_router(tutor_router, prefix="/api")
    application.include_router(progress_router, prefix="/api")
    application.include_router(dashboard_router, prefix="/api")
    return application


app = create_app()
