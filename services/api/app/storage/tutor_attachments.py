from __future__ import annotations

import os
import re
import secrets
import warnings
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from starlette.datastructures import UploadFile

MAX_TUTOR_ATTACHMENT_BYTES = 5 * 1024 * 1024
_ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}
_STORAGE_KEY_PATTERN = re.compile(r"\A[0-9a-f]{48}\.(?:jpg|png|webp)\Z")


class TutorAttachmentTooLargeError(ValueError):
    """The uploaded image exceeds the Tutor attachment byte limit."""


class InvalidTutorAttachmentError(ValueError):
    """The attachment is unsupported, corrupt, or has an unsafe storage key."""


@dataclass(frozen=True)
class StoredTutorAttachment:
    storage_key: str
    mime_type: str
    byte_size: int


def _validate_image(payload: bytes, declared_mime: str) -> tuple[str, str]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(payload)) as image:
                detected_format = image.format
                image.verify()
            with Image.open(BytesIO(payload)) as image:
                image.load()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        ValueError,
        UnidentifiedImageError,
    ) as error:
        raise InvalidTutorAttachmentError(
            "รองรับเฉพาะภาพ JPEG, PNG หรือ WebP ที่อ่านได้"
        ) from error

    details = _ALLOWED_FORMATS.get(detected_format or "")
    if details is None:
        raise InvalidTutorAttachmentError("รองรับเฉพาะภาพ JPEG, PNG หรือ WebP")
    expected_mime, extension = details
    normalized_mime = (declared_mime or "").split(";", 1)[0].strip().lower()
    if normalized_mime != expected_mime:
        raise InvalidTutorAttachmentError("ชนิดไฟล์ไม่ตรงกับเนื้อหาภาพ")
    return expected_mime, extension


def store_tutor_attachment(
    upload: UploadFile,
    storage_dir: str | Path,
) -> StoredTutorAttachment:
    payload = upload.file.read(MAX_TUTOR_ATTACHMENT_BYTES + 1)
    if len(payload) > MAX_TUTOR_ATTACHMENT_BYTES:
        raise TutorAttachmentTooLargeError("ภาพต้องมีขนาดไม่เกิน 5 MiB")
    if not payload:
        raise InvalidTutorAttachmentError("ไฟล์ภาพว่างเปล่า")

    mime_type, extension = _validate_image(payload, upload.content_type or "")
    directory = Path(storage_dir)
    directory.mkdir(parents=True, exist_ok=True)
    storage_key = f"{secrets.token_hex(24)}{extension}"
    staging_path = directory / f".{storage_key}.{secrets.token_hex(8)}.tmp"
    final_path = directory / storage_key
    try:
        with staging_path.open("xb") as staged_file:
            staged_file.write(payload)
            staged_file.flush()
            os.fsync(staged_file.fileno())
        os.replace(staging_path, final_path)
    except Exception:
        staging_path.unlink(missing_ok=True)
        raise
    return StoredTutorAttachment(storage_key, mime_type, len(payload))


def read_tutor_attachment(storage_key: str, storage_dir: str | Path) -> bytes:
    if not isinstance(storage_key, str) or not _STORAGE_KEY_PATTERN.fullmatch(storage_key):
        raise InvalidTutorAttachmentError("คีย์ไฟล์ภาพไม่ถูกต้อง")
    directory = Path(storage_dir).resolve()
    path = directory / storage_key
    if path.is_symlink() or path.resolve().parent != directory:
        raise InvalidTutorAttachmentError("คีย์ไฟล์ภาพไม่ถูกต้อง")
    payload = path.read_bytes()
    if len(payload) > MAX_TUTOR_ATTACHMENT_BYTES:
        raise InvalidTutorAttachmentError("ไฟล์ภาพที่จัดเก็บมีขนาดไม่ถูกต้อง")
    return payload
