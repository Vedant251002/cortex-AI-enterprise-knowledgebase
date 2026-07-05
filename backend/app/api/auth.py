from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from app.core.security import create_access_token, get_current_user
from app.models.roles import DEMO_USERS
from app.schemas.auth import CurrentUser, LoginRequest, TokenResponse, UserOut
from app.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, background_tasks: BackgroundTasks) -> TokenResponse:
    demo_user = DEMO_USERS.get(payload.user_id)
    if demo_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown demo user")

    token = create_access_token(
        user_id=demo_user["id"],
        email=demo_user["email"],
        name=demo_user["name"],
        role=demo_user["role"],
        categories=demo_user["categories"],
    )

    background_tasks.add_task(
        log_audit_event,
        user_id=demo_user["id"],
        user_email=demo_user["email"],
        user_role=demo_user["role"],
        event_type="login",
        action="POST /auth/login",
        resource="/auth/login",
        ip_address=request.client.host if request.client else "unknown",
        session_id="pre-session",
        details={"demo_user_key": payload.user_id},
    )

    return TokenResponse(access_token=token, user=UserOut(**demo_user))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser = Depends(get_current_user)) -> UserOut:
    demo_user = DEMO_USERS.get(
        next((k for k, v in DEMO_USERS.items() if v["id"] == user.id), "")
    )
    if demo_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut(**demo_user)


@router.post("/logout")
async def logout(
    request: Request,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    background_tasks.add_task(
        log_audit_event,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        event_type="logout",
        action="POST /auth/logout",
        resource="/auth/logout",
        ip_address=request.client.host if request.client else "unknown",
        session_id=user.session_id,
        details={},
    )
    return {"status": "logged_out"}
