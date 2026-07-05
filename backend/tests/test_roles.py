from app.models.roles import ALL_CATEGORIES, DEMO_USERS, ROLE_CATEGORIES


def test_role_categories_match_spec():
    assert ROLE_CATEGORIES["admin"] == ["general", "finance", "hr", "legal", "engineering"]
    assert ROLE_CATEGORIES["analyst"] == ["general", "finance"]
    assert ROLE_CATEGORIES["viewer"] == ["general"]


def test_admin_categories_equal_all_categories():
    assert set(ROLE_CATEGORIES["admin"]) == set(ALL_CATEGORIES)


def test_every_role_is_a_strict_subset_of_all_categories():
    for role, categories in ROLE_CATEGORIES.items():
        assert set(categories).issubset(set(ALL_CATEGORIES)), f"{role} has an unknown category"


def test_demo_users_role_and_categories_are_consistent():
    for key, user in DEMO_USERS.items():
        assert user["role"] == key
        assert user["categories"] == ROLE_CATEGORIES[user["role"]]


def test_demo_user_ids_and_emails_are_unique():
    ids = [u["id"] for u in DEMO_USERS.values()]
    emails = [u["email"] for u in DEMO_USERS.values()]
    assert len(ids) == len(set(ids))
    assert len(emails) == len(set(emails))
