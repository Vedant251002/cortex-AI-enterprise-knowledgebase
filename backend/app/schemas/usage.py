from pydantic import BaseModel


class UsageBucket(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    embedding_tokens: int
    query_count: int


class RecentQuery(BaseModel):
    id: str
    timestamp: str
    message_preview: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: float


class QuotaStatus(BaseModel):
    """None `limit` means the caller's role has no configured quota (unlimited)."""

    limit: int | None
    used: int
    remaining: int | None
    percent_used: float | None
    exceeded: bool


class MyUsageResponse(BaseModel):
    today: UsageBucket
    week: UsageBucket
    month: UsageBucket
    all_time: UsageBucket
    recent_queries: list[RecentQuery]
    quota: QuotaStatus


class LeaderboardEntry(BaseModel):
    user_id: str
    prompt_tokens: int
    completion_tokens: int
    embedding_tokens: int
    total_tokens: int
    query_count: int
    estimated_cost: float


class DailyTrendEntry(BaseModel):
    date: str
    prompt_tokens: int
    completion_tokens: int
    embedding_tokens: int
    total_tokens: int
    query_count: int


class UsageAllResponse(BaseModel):
    leaderboard: list[LeaderboardEntry]
    daily_trend: list[DailyTrendEntry]


class UserUsageDetail(BaseModel):
    user_id: str
    today: UsageBucket
    week: UsageBucket
    month: UsageBucket
    all_time: UsageBucket
    recent_queries: list[RecentQuery]
    daily_history: list[DailyTrendEntry]
