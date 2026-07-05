from app.services.audit import VALID_EVENT_TYPES, _build_audit_query


def test_valid_event_types_match_the_documented_8():
    assert VALID_EVENT_TYPES == {
        "login",
        "logout",
        "document_upload",
        "document_delete",
        "chat_query",
        "content_safety_flag",
        "rbac_denial",
        "admin_action",
    }


def test_build_audit_query_with_no_filters():
    query, params = _build_audit_query(user_id=None, event_type=None, date_from=None, date_to=None, document=None)
    assert query == "SELECT * FROM c ORDER BY c.timestamp DESC"
    assert params == []


def test_build_audit_query_with_all_filters_uses_parameterized_values():
    query, params = _build_audit_query(
        user_id="user-1",
        event_type="chat_query",
        date_from="2026-01-01",
        date_to="2026-01-31",
        document="report.pdf",
    )
    # Every filter value must travel as a bound parameter, never string-interpolated into the
    # query text - that's what makes this safe against Cosmos SQL injection.
    assert "@user_id" in query
    assert "@event_type" in query
    assert "@date_from" in query
    assert "@date_to" in query
    assert "@document" in query
    assert query.endswith("ORDER BY c.timestamp DESC")

    values = {p["name"]: p["value"] for p in params}
    assert values == {
        "@user_id": "user-1",
        "@event_type": "chat_query",
        "@date_from": "2026-01-01",
        "@date_to": "2026-01-31",
        "@document": "report.pdf",
    }


def test_build_audit_query_partial_filters_only_include_those_conditions():
    query, params = _build_audit_query(user_id="user-1", event_type=None, date_from=None, date_to=None, document=None)
    assert "@user_id" in query
    assert "@event_type" not in query
    assert len(params) == 1
