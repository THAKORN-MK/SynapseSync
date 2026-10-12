from fastapi.testclient import TestClient

from app.main import create_app, resolve_database_url


def test_database_url_uses_supabase_postgres_pooler_scheme(monkeypatch, tmp_path):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres.project-ref:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    )

    assert resolve_database_url(None, tmp_path) == (
        "postgresql+psycopg://postgres.project-ref:secret@"
        "aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
    )


def test_deployed_app_serves_spa_assets_and_preserves_api_404s(tmp_path):
    web_root = tmp_path / "web"
    assets = web_root / "assets"
    assets.mkdir(parents=True)
    (web_root / "index.html").write_text("<main>SynapseSync UI</main>", encoding="utf-8")
    (assets / "app.js").write_text("window.synapseSyncLoaded = true;", encoding="utf-8")

    app = create_app(
        database_url=f"sqlite:///{(tmp_path / 'app.db').as_posix()}",
        image_storage_dir=tmp_path / "images",
        document_storage_dir=tmp_path / "documents",
        document_staging_dir=tmp_path / "staging",
        tutor_attachment_storage_dir=tmp_path / "tutor-attachments",
        webapp_dist_dir=web_root,
    )

    with TestClient(app) as client:
        assert client.get("/").text == "<main>SynapseSync UI</main>"
        assert client.get("/quizzes/123").text == "<main>SynapseSync UI</main>"
        assert client.get("/assets/app.js").text == "window.synapseSyncLoaded = true;"
        assert client.get("/health").json()["status"] == "healthy"
        assert client.get("/api/route-that-does-not-exist").status_code == 404
        assert client.get("/missing.js").status_code == 404
