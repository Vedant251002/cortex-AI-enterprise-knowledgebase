"""Token usage tracking. One doc per user per day; increment_usage upserts it.
Aggregation queries (week/month/all-time, leaderboard) live in api/usage.py (Phase 4).
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.core.azure_clients import get_usage_container
from app.core.config import get_settings


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def increment_usage(
    *,
    user_id: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    embedding_tokens: int = 0,
) -> None:
    container = get_usage_container()
    date = _today()
    doc_id = f"{user_id}_{date}"

    try:
        doc = container.read_item(item=doc_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        doc = {
            "id": doc_id,
            "user_id": user_id,
            "date": date,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "embedding_tokens": 0,
            "query_count": 0,
        }

    doc["prompt_tokens"] += prompt_tokens
    doc["completion_tokens"] += completion_tokens
    doc["embedding_tokens"] += embedding_tokens
    doc["total_tokens"] += prompt_tokens + completion_tokens
    if prompt_tokens or completion_tokens:
        doc["query_count"] += 1

    container.upsert_item(body=doc)


def _empty_bucket() -> dict:
    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "embedding_tokens": 0,
        "query_count": 0,
    }


def _add_doc_to_bucket(bucket: dict, doc: dict) -> None:
    bucket["prompt_tokens"] += doc.get("prompt_tokens", 0)
    bucket["completion_tokens"] += doc.get("completion_tokens", 0)
    bucket["total_tokens"] += doc.get("total_tokens", 0)
    bucket["embedding_tokens"] += doc.get("embedding_tokens", 0)
    bucket["query_count"] += doc.get("query_count", 0)


def estimate_cost(prompt_tokens: int, completion_tokens: int, embedding_tokens: int = 0) -> float:
    """Pure function estimating $ cost from token counts using configured per-1K rates."""
    settings = get_settings()
    return (
        (prompt_tokens / 1000) * settings.cost_per_1k_prompt_tokens
        + (completion_tokens / 1000) * settings.cost_per_1k_completion_tokens
        + (embedding_tokens / 1000) * settings.cost_per_1k_embedding_tokens
    )


def get_daily_quota_for_role(role: str) -> int | None:
    """Per-role daily token quota (§7.3). None means unlimited for that role. Per-role only,
    not per-user - see README Known Limitations for the per-user admin-override roadmap item."""
    settings = get_settings()
    return {
        "admin": settings.daily_token_quota_admin,
        "analyst": settings.daily_token_quota_analyst,
        "viewer": settings.daily_token_quota_viewer,
    }.get(role)


async def get_quota_status(user_id: str, role: str) -> dict:
    """Today's token usage against the caller's role quota. Used both to render the My Usage
    progress bar and to gate /chat before it spends any Azure OpenAI tokens."""
    quota = get_daily_quota_for_role(role)
    container = get_usage_container()
    doc_id = f"{user_id}_{_today()}"
    try:
        doc = container.read_item(item=doc_id, partition_key=user_id)
        used = doc.get("total_tokens", 0)
    except CosmosResourceNotFoundError:
        used = 0

    if quota is None:
        return {"limit": None, "used": used, "remaining": None, "percent_used": None, "exceeded": False}

    remaining = max(quota - used, 0)
    percent_used = round(used / quota, 4) if quota else 0.0
    return {
        "limit": quota,
        "used": used,
        "remaining": remaining,
        "percent_used": percent_used,
        "exceeded": used >= quota,
    }


async def get_user_daily_history(user_id: str, days: int = 30) -> list[dict]:
    """Per-day usage history for a single user, for the admin drill-down view."""
    container = get_usage_container()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    query = "SELECT * FROM c WHERE c.user_id = @user_id AND c.date >= @cutoff"
    parameters = [{"name": "@user_id", "value": user_id}, {"name": "@cutoff", "value": cutoff}]
    item_paged = container.query_items(query=query, parameters=parameters, partition_key=user_id)

    docs = sorted(item_paged, key=lambda d: d.get("date", ""))
    return [
        {
            "date": doc.get("date", ""),
            "prompt_tokens": doc.get("prompt_tokens", 0),
            "completion_tokens": doc.get("completion_tokens", 0),
            "embedding_tokens": doc.get("embedding_tokens", 0),
            "total_tokens": doc.get("total_tokens", 0),
            "query_count": doc.get("query_count", 0),
        }
        for doc in docs
    ]


async def get_user_usage_summary(user_id: str) -> dict:
    """Aggregates a single user's daily usage docs into today/week/month/all-time buckets,
    plus their 20 most recent chat_query audit events.
    """
    # Import locally to avoid a module-level circular import between audit.py and usage.py.
    from app.services.audit import query_audit_events

    container = get_usage_container()
    query = "SELECT * FROM c WHERE c.user_id = @user_id"
    parameters = [{"name": "@user_id", "value": user_id}]
    item_paged = container.query_items(query=query, parameters=parameters, partition_key=user_id)

    docs = list(item_paged)

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    week_start_str = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start_str = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    today = _empty_bucket()
    week = _empty_bucket()
    month = _empty_bucket()
    all_time = _empty_bucket()

    for doc in docs:
        date = doc.get("date", "")
        if date == today_str:
            _add_doc_to_bucket(today, doc)
        if date >= week_start_str:
            _add_doc_to_bucket(week, doc)
        if date >= month_start_str:
            _add_doc_to_bucket(month, doc)
        _add_doc_to_bucket(all_time, doc)

    raw_recent_queries, _ = await query_audit_events(
        user_id=user_id,
        event_type="chat_query",
        max_item_count=20,
    )
    # query_audit_events() returns raw Cosmos audit documents (nested details/token_usage,
    # plus internal Cosmos metadata like _rid/_etag) - reshape into the flat contract the
    # frontend's RecentQuery type actually expects, and drop everything else.
    recent_queries = [
        {
            "id": doc["id"],
            "timestamp": doc["timestamp"],
            "message_preview": (doc.get("details") or {}).get("query", ""),
            "prompt_tokens": (doc.get("token_usage") or {}).get("prompt_tokens", 0),
            "completion_tokens": (doc.get("token_usage") or {}).get("completion_tokens", 0),
            "total_tokens": (doc.get("token_usage") or {}).get("total_tokens", 0),
            "latency_ms": (doc.get("details") or {}).get("latency_ms", 0),
        }
        for doc in raw_recent_queries
    ]

    return {
        "today": today,
        "week": week,
        "month": month,
        "all_time": all_time,
        "recent_queries": recent_queries,
    }


async def get_usage_leaderboard() -> list[dict]:
    """Cross-partition aggregation of all-time usage totals grouped by user_id, sorted desc
    by total_tokens, each with an estimated dollar cost.
    """
    container = get_usage_container()
    query = "SELECT * FROM c"
    item_paged = container.query_items(query=query, enable_cross_partition_query=True)

    per_user: dict[str, dict] = defaultdict(_empty_bucket)
    for doc in item_paged:
        user_id = doc.get("user_id", "unknown")
        _add_doc_to_bucket(per_user[user_id], doc)

    leaderboard = []
    for user_id, bucket in per_user.items():
        leaderboard.append(
            {
                "user_id": user_id,
                "prompt_tokens": bucket["prompt_tokens"],
                "completion_tokens": bucket["completion_tokens"],
                "embedding_tokens": bucket["embedding_tokens"],
                "total_tokens": bucket["total_tokens"],
                "query_count": bucket["query_count"],
                "estimated_cost": estimate_cost(
                    bucket["prompt_tokens"],
                    bucket["completion_tokens"],
                    bucket["embedding_tokens"],
                ),
            }
        )

    leaderboard.sort(key=lambda entry: entry["total_tokens"], reverse=True)
    return leaderboard


async def get_usage_daily_trend(days: int = 30) -> list[dict]:
    """Cross-partition aggregation of total_tokens per date across all users, for the last
    `days` days, sorted ascending by date — feeds a trend line chart.
    """
    container = get_usage_container()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    query = "SELECT * FROM c WHERE c.date >= @cutoff"
    parameters = [{"name": "@cutoff", "value": cutoff}]
    item_paged = container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True,
    )

    per_date: dict[str, dict] = defaultdict(_empty_bucket)
    for doc in item_paged:
        date = doc.get("date", "")
        _add_doc_to_bucket(per_date[date], doc)

    trend = [
        {
            "date": date,
            "prompt_tokens": bucket["prompt_tokens"],
            "completion_tokens": bucket["completion_tokens"],
            "embedding_tokens": bucket["embedding_tokens"],
            "total_tokens": bucket["total_tokens"],
            "query_count": bucket["query_count"],
        }
        for date, bucket in per_date.items()
    ]
    trend.sort(key=lambda entry: entry["date"])
    return trend
