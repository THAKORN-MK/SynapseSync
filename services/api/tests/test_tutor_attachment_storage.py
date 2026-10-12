from __future__ import annotations

from importlib import import_module
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from starlette.datastructures import Headers, UploadFile


def _image_bytes(image_format: str = "PNG") -> bytes:
    stream = BytesIO()
    Image.new("RGB", (3, 2), color=(34, 91, 177)).save(stream, format=image_format)
    return stream.getvalue()


def _upload(payload: bytes, mime_type: str, filename: str = "lesson.png") -> UploadFile:
    return UploadFile(
        file=BytesIO(payload),
        filename=filename,
        headers=Headers({"content-type": mime_type}),
    )


def test_store_tutor_attachment_accepts_supported_image_and_uses_random_key(tmp_path: Path) -> None:
    storage = import_module("app.storage.tutor_attachments")
    payload = _image_bytes()

    first = storage.store_tutor_attachment(_upload(payload, "image/png"), tmp_path)
    second = storage.store_tutor_attachment(_upload(payload, "image/png"), tmp_path)

    assert first.mime_type == "image/png"
    assert first.byte_size == len(payload)
    assert first.storage_key != second.storage_key
    assert Path(first.storage_key).name == first.storage_key
    assert storage.read_tutor_attachment(first.storage_key, tmp_path) == payload
    assert len(list(tmp_path.iterdir())) == 2


@pytest.mark.parametrize(
    ("payload", "declared_mime"),
    [
        (_image_bytes("PNG"), "image/jpeg"),
        (b"not an image", "image/png"),
    ],
)
def test_store_tutor_attachment_rejects_mime_mismatch_and_corrupt_image(
    tmp_path: Path,
    payload: bytes,
    declared_mime: str,
) -> None:
    storage = import_module("app.storage.tutor_attachments")

    with pytest.raises(storage.InvalidTutorAttachmentError):
        storage.store_tutor_attachment(_upload(payload, declared_mime), tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_store_tutor_attachment_rejects_more_than_five_mib_and_cleans_partial_file(
    tmp_path: Path,
) -> None:
    storage = import_module("app.storage.tutor_attachments")
    payload = b"x" * (5 * 1024 * 1024 + 1)

    with pytest.raises(storage.TutorAttachmentTooLargeError):
        storage.store_tutor_attachment(_upload(payload, "image/png"), tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_read_tutor_attachment_rejects_path_traversal(tmp_path: Path) -> None:
    storage = import_module("app.storage.tutor_attachments")

    with pytest.raises(storage.InvalidTutorAttachmentError):
        storage.read_tutor_attachment("../outside.png", tmp_path)
