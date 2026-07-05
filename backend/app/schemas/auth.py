from pydantic import BaseModel


class LoginRequest(BaseModel):
    user_id: str  # one of: "admin", "analyst", "viewer"


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    categories: list[str]
    avatar: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CurrentUser(BaseModel):
    id: str
    email: str
    name: str
    role: str
    categories: list[str]
    session_id: str
