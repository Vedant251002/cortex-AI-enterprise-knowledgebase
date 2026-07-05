"""Azure AI Content Safety text screening.

Used to screen both inbound user messages and outbound LLM answers before they are
considered "safe to serve" for this demo. The underlying azure-ai-contentsafety SDK client
is synchronous, so the blocking call is off-loaded to a thread via asyncio.to_thread to avoid
stalling the event loop.
"""

import asyncio
from typing import Any

from azure.ai.contentsafety.models import AnalyzeTextOptions

from app.core.azure_clients import get_content_safety_client
from app.core.retry import with_azure_retry

# Severity is reported on a 0-6 scale (FourSeverityLevels output maps onto 0/2/4/6, but the
# SDK can also report the full 0-6 range). Treat >= 4 on ANY category as a block for this demo.
SEVERITY_THRESHOLD = 4

CATEGORIES = ("Hate", "SelfHarm", "Sexual", "Violence")


@with_azure_retry()
def _analyze_sync(text: str) -> Any:
    client = get_content_safety_client()
    return client.analyze_text(AnalyzeTextOptions(text=text))


async def screen_text(text: str) -> tuple[bool, dict]:
    """Screen `text` with Azure AI Content Safety.

    Returns (is_safe, details). `details` always includes a per-category severity map
    suitable for attaching to an audit log entry, plus the highest severity seen and
    whether that triggered a block.
    """
    result = await asyncio.to_thread(_analyze_sync, text)

    severities: dict[str, int] = {}
    for category_result in result.categories_analysis:
        severities[category_result.category] = category_result.severity or 0

    # Make sure every known category has an entry even if the API omitted it.
    for category in CATEGORIES:
        severities.setdefault(category, 0)

    max_severity = max(severities.values()) if severities else 0
    is_safe = max_severity < SEVERITY_THRESHOLD

    details = {
        "severities": severities,
        "max_severity": max_severity,
        "threshold": SEVERITY_THRESHOLD,
        "blocked": not is_safe,
    }
    return is_safe, details
