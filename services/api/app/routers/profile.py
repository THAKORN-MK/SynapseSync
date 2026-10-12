from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session
from starlette.responses import FileResponse

from app.models import User
from app.routers.auth import _public_user, get_current_user, get_db, require_same_origin
from app.schemas.auth import PublicUser
from app.storage.profile_images import (
    AvatarTooLargeError,
    InvalidAvatarError,
    validate_and_store_avatar,
)

router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=PublicUser)
def get_profile(user: User = Depends(get_current_user)) -> dict[str, object]:
    return _public_user(user)


@router.patch("/profile", response_model=PublicUser)
def update_profile(
    payload: dict[str, object],
    request: Request,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    require_same_origin(request)
    allowed_fields = {"display_name", "bio", "learning_goal", "learning_topics"}
    if set(payload) - allowed_fields:
        raise HTTPException(status_code=422, detail="ข้อมูลโปรไฟล์ไม่ถูกต้อง")

    if "display_name" in payload:
        display_name = payload["display_name"]
        if not isinstance(display_name, str) or not display_name.strip() or len(display_name.strip()) > 80:
            raise HTTPException(status_code=422, detail="ชื่อที่ใช้แสดงต้องมี 1 ถึง 80 ตัวอักษร")
        user.display_name = display_name.strip()

    if "bio" in payload:
        bio = payload["bio"]
        if bio is not None and (not isinstance(bio, str) or len(bio) > 500):
            raise HTTPException(status_code=422, detail="คำแนะนำตัวต้องมีไม่เกิน 500 ตัวอักษร")
        user.bio = bio

    if "learning_goal" in payload:
        learning_goal = payload["learning_goal"]
        if learning_goal is not None and (
            not isinstance(learning_goal, str) or len(learning_goal.strip()) > 200
        ):
            raise HTTPException(status_code=422, detail="เป้าหมายการเรียนต้องมีไม่เกิน 200 ตัวอักษร")
        user.learning_goal = learning_goal.strip() or None if isinstance(learning_goal, str) else None

    if "learning_topics" in payload:
        learning_topics = payload["learning_topics"]
        if not isinstance(learning_topics, list) or len(learning_topics) > 10:
            raise HTTPException(status_code=422, detail="เลือกหัวข้อที่สนใจได้ไม่เกิน 10 หัวข้อ")
        normalized_topics: list[str] = []
        seen_topics: set[str] = set()
        for topic in learning_topics:
            if not isinstance(topic, str) or not topic.strip() or len(topic.strip()) > 40:
                raise HTTPException(status_code=422, detail="หัวข้อที่สนใจต้องมี 1 ถึง 40 ตัวอักษร")
            normalized_topic = topic.strip()
            duplicate_key = normalized_topic.casefold()
            if duplicate_key not in seen_topics:
                normalized_topics.append(normalized_topic)
                seen_topics.add(duplicate_key)
        user.learning_topics = normalized_topics

    session.add(user)
    session.commit()
    session.refresh(user)
    return _public_user(user)


@router.put("/profile/avatar", response_model=PublicUser)
def upload_profile_avatar(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    require_same_origin(request)
    try:
        storage_key = validate_and_store_avatar(file, request.app.state.image_storage_dir)
    except AvatarTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except InvalidAvatarError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error

    previous_key = user.avatar_key
    user.avatar_key = storage_key
    session.add(user)
    session.commit()
    session.refresh(user)

    if previous_key:
        previous_path = Path(request.app.state.image_storage_dir) / previous_key
        if previous_path.name == previous_key:
            previous_path.unlink(missing_ok=True)
    return _public_user(user)


@router.get("/profile/avatar")
def get_profile_avatar(
    request: Request,
    user: User = Depends(get_current_user),
) -> Response:
    if not user.avatar_key:
        raise HTTPException(status_code=404, detail="ยังไม่มีภาพโปรไฟล์")

    image_path = Path(request.app.state.image_storage_dir) / user.avatar_key
    if image_path.name != user.avatar_key or not image_path.is_file():
        raise HTTPException(status_code=404, detail="ไม่พบภาพโปรไฟล์")

    media_type = {
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(image_path.suffix.lower())
    if media_type is None:
        raise HTTPException(status_code=404, detail="ไม่พบภาพโปรไฟล์")
    return FileResponse(image_path, media_type=media_type)
