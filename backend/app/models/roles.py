from typing import TypedDict


class DemoUser(TypedDict):
    id: str
    email: str
    name: str
    role: str
    categories: list[str]
    avatar: str


ROLE_CATEGORIES: dict[str, list[str]] = {
    "admin": ["general", "finance", "hr", "legal", "engineering"],
    "analyst": ["general", "finance"],
    "viewer": ["general"],
}

ALL_CATEGORIES: list[str] = ["general", "finance", "hr", "legal", "engineering"]

DEMO_USERS: dict[str, DemoUser] = {
    "admin": {
        "id": "user-admin-001",
        "email": "aisha.admin@cortex.demo",
        "name": "Aisha",
        "role": "admin",
        "categories": ROLE_CATEGORIES["admin"],
        "avatar": "AA",
    },
    "analyst": {
        "id": "user-analyst-001",
        "email": "arjun.analyst@cortex.demo",
        "name": "Arjun",
        "role": "analyst",
        "categories": ROLE_CATEGORIES["analyst"],
        "avatar": "AR",
    },
    "viewer": {
        "id": "user-viewer-001",
        "email": "vik.viewer@cortex.demo",
        "name": "Vik",
        "role": "viewer",
        "categories": ROLE_CATEGORIES["viewer"],
        "avatar": "VV",
    },
}
