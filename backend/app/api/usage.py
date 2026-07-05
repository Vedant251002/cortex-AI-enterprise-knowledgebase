import csv
import io
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.security import get_current_user, require_role
from app.schemas.auth import CurrentUser
from app.schemas.usage import MyUsageResponse, UsageAllResponse, UserUsageDetail
from app.services.usage import (
    get_quota_status,
    get_usage_daily_trend,
    get_usage_leaderboard,
    get_user_daily_history,
    get_user_usage_summary,
)

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/me", response_model=MyUsageResponse)
async def usage_me(user: CurrentUser = Depends(get_current_user)) -> dict:
    summary = await get_user_usage_summary(user.id)
    summary["quota"] = await get_quota_status(user.id, user.role)
    return summary


@router.get("/all", response_model=UsageAllResponse)
async def usage_all(user: CurrentUser = Depends(require_role("admin"))) -> dict:
    leaderboard = await get_usage_leaderboard()
    daily_trend = await get_usage_daily_trend()
    return {"leaderboard": leaderboard, "daily_trend": daily_trend}


@router.get("/all/{user_id}", response_model=UserUsageDetail)
async def usage_user_detail(user_id: str, user: CurrentUser = Depends(require_role("admin"))) -> dict:
    """Per-user drill-down for the Admin Usage Analytics leaderboard (§7.2)."""
    summary = await get_user_usage_summary(user_id)
    daily_history = await get_user_daily_history(user_id)
    return {**summary, "user_id": user_id, "daily_history": daily_history}


@router.get("/export")
async def usage_export(
    format: str = Query("csv", pattern="^(csv|json)$"),
    user: CurrentUser = Depends(require_role("admin")),
) -> Response:
    leaderboard = await get_usage_leaderboard()

    if format == "json":
        return Response(
            content=json.dumps(leaderboard, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=usage_export.json"},
        )

    buffer = io.StringIO()
    fieldnames = [
        "user_id",
        "prompt_tokens",
        "completion_tokens",
        "embedding_tokens",
        "total_tokens",
        "query_count",
        "estimated_cost",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in leaderboard:
        writer.writerow(row)

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=usage_export.csv"},
    )
