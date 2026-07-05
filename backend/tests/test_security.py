import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, decode_token, visible_categories
from app.schemas.auth import CurrentUser


def test_create_and_decode_token_roundtrip():
    token = create_access_token(
        user_id="user-analyst-001",
        email="arjun@demo.test",
        name="Arjun",
        role="analyst",
        categories=["general", "finance"],
    )
    payload = decode_token(token)

    assert payload["sub"] == "user-analyst-001"
    assert payload["email"] == "arjun@demo.test"
    assert payload["name"] == "Arjun"
    assert payload["role"] == "analyst"
    assert payload["categories"] == ["general", "finance"]
    assert "session_id" in payload
    assert "exp" in payload


def test_each_token_gets_a_unique_session_id():
    kwargs = dict(user_id="u", email="e@x.com", name="N", role="viewer", categories=["general"])
    token_a = create_access_token(**kwargs)
    token_b = create_access_token(**kwargs)
    assert decode_token(token_a)["session_id"] != decode_token(token_b)["session_id"]


def test_decode_token_rejects_garbage():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not.a.valid.jwt")
    assert exc_info.value.status_code == 401


def test_decode_token_rejects_tampered_signature():
    token = create_access_token(user_id="u", email="e@x.com", name="N", role="admin", categories=["general"])
    tampered = token[:-2] + ("aa" if not token.endswith("aa") else "bb")
    with pytest.raises(HTTPException):
        decode_token(tampered)


def test_visible_categories_admin_sees_all_five():
    admin = CurrentUser(id="u1", email="a@x.com", name="A", role="admin", categories=["general"], session_id="s")
    assert set(visible_categories(admin)) == {"general", "finance", "hr", "legal", "engineering"}


def test_visible_categories_non_admin_sees_only_their_own():
    analyst = CurrentUser(
        id="u2", email="b@x.com", name="B", role="analyst", categories=["general", "finance"], session_id="s"
    )
    assert visible_categories(analyst) == ["general", "finance"]
