from __future__ import annotations

import importlib
from pathlib import Path


def test_configured_data_directory_does_not_resolve_repository_root(tmp_path: Path, monkeypatch) -> None:
    main = importlib.import_module("app.main")
    configured_data_dir = tmp_path / "render-data"
    monkeypatch.setenv("SYNAPSESYNC_DATA_DIR", str(configured_data_dir))

    def unavailable_repository_root() -> Path:
        raise AssertionError("The repository-root fallback must not be evaluated when a data directory is configured")

    monkeypatch.setattr(main, "_repository_root", unavailable_repository_root)

    application = main.create_app(database_url="sqlite:///:memory:")

    assert application.state.image_storage_dir == configured_data_dir / "profile-images"
    assert application.state.document_storage_dir == configured_data_dir / "documents"
