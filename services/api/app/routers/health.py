from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app import __version__

router = APIRouter(tags=["operations"])


@router.get("/", response_model=None)
def service_discovery(request: Request) -> dict[str, str] | FileResponse:
    webapp_dist_dir = request.app.state.webapp_dist_dir
    if request.url.path == "/" and webapp_dist_dir is not None:
        index_file = webapp_dist_dir / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
    return {
        "service": "synapsesync-api",
        "status": "prototype-to-mvp",
        "health": "/health",
        "docs": "/docs",
    }


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "synapsesync-api",
        "architecture": "modular-monolith",
        "version": __version__,
    }
