from __future__ import annotations

import struct
import zlib

import pytest

from conftest import registration_payload, same_origin_headers


def _png_bytes() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        contents = kind + data
        return struct.pack(">I", len(data)) + contents + struct.pack(">I", zlib.crc32(contents) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\x10\x20\x30"))
        + chunk(b"IEND", b"")
    )


def test_profile_endpoints_require_a_session(client_factory) -> None:
    with client_factory() as client:
        assert client.get("/api/profile").status_code == 401
        assert client.patch("/api/profile", json={"display_name": "Changed"}, headers=same_origin_headers()).status_code == 401
        assert client.put(
            "/api/profile/avatar",
            files={"file": ("avatar.png", _png_bytes(), "image/png")},
            headers=same_origin_headers(),
        ).status_code == 401
        assert client.get("/api/profile/avatar").status_code == 401


def test_profile_update_persists_only_allowed_profile_fields(client_factory) -> None:
    with client_factory() as client:
        registered = client.post("/api/auth/register", json=registration_payload(), headers=same_origin_headers())
        response = client.patch(
            "/api/profile",
            json={
                "display_name": "  New Name  ",
                "bio": "Learning every day",
                "learning_goal": "Build a steady study habit",
                "learning_topics": ["Algebra", "Biology"],
            },
            headers=same_origin_headers(),
        )

        assert registered.status_code == 201
        assert response.status_code == 200
        assert response.json() == {
            "id": registered.json()["id"],
            "email": "learner@example.com",
            "display_name": "New Name",
            "bio": "Learning every day",
            "learning_goal": "Build a steady study habit",
            "learning_topics": ["Algebra", "Biology"],
            "avatar_url": None,
        }
        assert client.get("/api/profile").json() == response.json()


@pytest.mark.parametrize(
    "profile_update",
    [
        {"learning_goal": "x" * 201},
        {"learning_topics": ["Topic"] * 11},
        {"learning_topics": ["x" * 41]},
        {"learning_topics": "not-a-list"},
    ],
)
def test_profile_rejects_invalid_learning_profile_values(client_factory, profile_update) -> None:
    with client_factory() as client:
        client.post("/api/auth/register", json=registration_payload(), headers=same_origin_headers())
        response = client.patch("/api/profile", json=profile_update, headers=same_origin_headers())

        assert response.status_code == 422
        profile = client.get("/api/profile").json()
        assert profile["learning_goal"] is None
        assert profile["learning_topics"] == []


def test_profiles_are_isolated_by_their_own_sessions(client_factory) -> None:
    with client_factory() as alice, client_factory() as bob:
        alice_user = alice.post(
            "/api/auth/register",
            json=registration_payload(email="alice@example.com", display_name="Alice"),
            headers=same_origin_headers(),
        ).json()
        bob_user = bob.post(
            "/api/auth/register",
            json=registration_payload(email="bob@example.com", display_name="Bob"),
            headers=same_origin_headers(),
        ).json()

        changed = alice.patch(
            "/api/profile",
            json={"id": bob_user["id"], "display_name": "Alice Updated"},
            headers=same_origin_headers(),
        )

        assert changed.status_code == 422
        assert alice.get("/api/profile").json()["display_name"] == "Alice"
        assert bob.get("/api/profile").json()["display_name"] == "Bob"
        assert alice_user["id"] != bob_user["id"]


def test_avatar_upload_uses_verified_image_bytes_and_ignores_original_filename(client_factory, tmp_path) -> None:
    with client_factory() as client:
        client.post("/api/auth/register", json=registration_payload(), headers=same_origin_headers())
        image_bytes = _png_bytes()
        uploaded = client.put(
            "/api/profile/avatar",
            files={"file": ("../../private-name.png", image_bytes, "image/png")},
            headers=same_origin_headers(),
        )

        assert uploaded.status_code == 200
        assert uploaded.json()["avatar_url"] == "/api/profile/avatar"
        assert "private-name" not in uploaded.text
        assert str(tmp_path) not in uploaded.text

        retrieved = client.get("/api/profile/avatar")
        assert retrieved.status_code == 200
        assert retrieved.headers["content-type"] == "image/png"
        assert retrieved.content == image_bytes
        stored_files = list((tmp_path / "profile-images").iterdir())
        assert len(stored_files) == 1
        assert stored_files[0].read_bytes() == image_bytes


@pytest.mark.parametrize(
    ("filename", "content", "content_type"),
    [
        ("fake.png", b"not an image", "image/png"),
        ("mismatch.jpg", _png_bytes(), "image/jpeg"),
        ("vector.svg", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml"),
    ],
)
def test_avatar_upload_rejects_invalid_or_mismatched_image_content(
    client_factory, filename: str, content: bytes, content_type: str
) -> None:
    with client_factory() as client:
        client.post("/api/auth/register", json=registration_payload(), headers=same_origin_headers())
        response = client.put(
            "/api/profile/avatar",
            files={"file": (filename, content, content_type)},
            headers=same_origin_headers(),
        )

    assert response.status_code == 415
    assert str(response.json()).find("profile-images") == -1


def test_avatar_upload_rejects_payloads_over_five_megabytes(client_factory) -> None:
    with client_factory() as client:
        client.post("/api/auth/register", json=registration_payload(), headers=same_origin_headers())
        response = client.put(
            "/api/profile/avatar",
            files={"file": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
            headers=same_origin_headers(),
        )

    assert response.status_code == 413
