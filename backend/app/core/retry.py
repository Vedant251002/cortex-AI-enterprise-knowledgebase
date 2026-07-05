"""Retry/backoff for Azure SDK and Azure OpenAI calls that can be throttled (HTTP 429).

Wraps *synchronous* Azure/OpenAI SDK calls (the ones this app runs inside asyncio.to_thread)
with exponential backoff. Only retries throttling - any other error re-raises immediately so
real failures aren't masked or delayed.
"""

import time
from functools import wraps
from typing import Callable, TypeVar

import structlog
from azure.core.exceptions import HttpResponseError
from openai import RateLimitError

logger = structlog.get_logger(__name__)

T = TypeVar("T")


def _is_throttled(exc: Exception) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, HttpResponseError):
        return exc.status_code == 429
    return False


def with_azure_retry(*, max_attempts: int = 4, base_delay_seconds: float = 1.0):
    """Decorator factory for sync functions. Retries on 429 with exponential backoff
    (base_delay_seconds * 2**attempt), up to max_attempts total tries."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: object, **kwargs: object) -> T:
            attempt = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except Exception as exc:  # noqa: BLE001 - re-raised immediately unless throttled
                    if not _is_throttled(exc):
                        raise
                    attempt += 1
                    if attempt >= max_attempts:
                        logger.error("azure_call_throttled_giving_up", func=func.__name__, attempts=attempt)
                        raise
                    delay = base_delay_seconds * (2 ** (attempt - 1))
                    logger.warning(
                        "azure_call_throttled_retrying",
                        func=func.__name__,
                        delay_seconds=delay,
                        attempt=attempt,
                        max_attempts=max_attempts,
                    )
                    time.sleep(delay)

        return wrapper

    return decorator
