import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.models.roles import ALL_CATEGORIES
from app.schemas.auth import CurrentUser
from app.services.audit import log_audit_event

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(*, user_id: str, email: str, name: str, role: str, categories: list[str]) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "role": role,
        "categories": categories,
        "session_id": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_token(credentials.credentials)
    return CurrentUser(
        id=payload["sub"],
        email=payload["email"],
        name=payload["name"],
        role=payload["role"],
        categories=payload["categories"],
        session_id=payload["session_id"],
    )


def require_role(*allowed_roles: str):
    """FastAPI dependency factory. Denies with 403 and writes an rbac_denial audit event."""

    async def dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if user.role not in allowed_roles:
            # Awaited directly, not scheduled via BackgroundTasks: a dependency that raises
            # HTTPException short-circuits FastAPI's normal response path, so a BackgroundTasks
            # instance added here would never be attached to the resulting error response and
            # would silently never run. A denial is security-relevant enough to eat the latency.
            await log_audit_event(
                user_id=user.id,
                user_email=user.email,
                user_role=user.role,
                event_type="rbac_denial",
                action=f"{request.method} {request.url.path}",
                resource=request.url.path,
                ip_address=request.client.host if request.client else "unknown",
                session_id=user.session_id,
                details={"required_roles": list(allowed_roles)},
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for this action")
        return user

    return dependency


def visible_categories(user: CurrentUser) -> list[str]:
    """Admins see every category; everyone else is restricted to their assigned categories."""
    return ALL_CATEGORIES if user.role == "admin" else user.categories


def require_categories(*, source: str = "form", param: str = "category"):
    """FastAPI dependency factory mirroring require_role(), but for category-level RBAC.

    Category permissions can't be checked before the request body is parsed (the category
    being accessed is caller-supplied, not fixed per-route like a role), so this reads the
    category from the given form field or query param, validates it exists, and denies
    (403 + rbac_denial audit event) if the caller's JWT-granted categories don't include it.
    """

    async def dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if source == "form":
            form = await request.form()
            category = form.get(param)
        elif source == "json":
            body = await request.json()
            category = body.get(param) if isinstance(body, dict) else None
        else:
            category = request.query_params.get(param)

        if not category or not isinstance(category, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Missing '{param}'")
        if category not in ALL_CATEGORIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown category '{category}'")
        if category not in visible_categories(user):
            await log_audit_event(
                user_id=user.id,
                user_email=user.email,
                user_role=user.role,
                event_type="rbac_denial",
                action=f"{request.method} {request.url.path}",
                resource=request.url.path,
                ip_address=request.client.host if request.client else "unknown",
                session_id=user.session_id,
                details={"required_category": category, "user_categories": user.categories},
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access this category")
        return user

    return dependency
