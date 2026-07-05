// Manual SSE (text/event-stream) parser driven off `fetch` + ReadableStream.
//
// We deliberately do NOT use the browser EventSource API: EventSource cannot
// send a custom `Authorization: Bearer <token>` header, and our chat endpoint
// requires Bearer auth. Instead we open a normal `fetch` POST request and
// parse the SSE wire format ourselves from the response body's byte stream.
//
// SSE framing recap: the stream is a sequence of UTF-8 text "blocks"
// separated by a blank line (\n\n). Each block is made of lines; lines
// starting with `event:` set the event type (default "message" if omitted),
// lines starting with `data:` contribute to the event's data payload (multiple
// `data:` lines are joined with \n). We only need `event:` and `data:` here.

import { API_BASE_URL, getAuthToken } from "@/api/client";
import type { ChatDoneEvent, ChatDeltaEvent } from "@/types/api";

export interface ParsedSSEEvent {
  event: string;
  data: string;
}

/**
 * Splits a raw SSE buffer into complete `{event, data}` blocks, returning
 * the parsed events plus whatever trailing partial text should be retained
 * in the buffer for the next chunk.
 */
export function parseSSEBuffer(buffer: string): {
  events: ParsedSSEEvent[];
  rest: string;
} {
  const events: ParsedSSEEvent[] = [];
  // Normalize CRLF to LF first: Starlette/sse-starlette emit "\r\n\r\n" as the
  // block separator, which does NOT contain the literal substring "\n\n" - splitting
  // on "\n\n" alone would silently merge every event in the stream into one.
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  // The final element may be an incomplete block (no trailing blank line yet).
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length > 0) {
      events.push({ event: eventType, data: dataLines.join("\n") });
    }
  }

  return { events, rest };
}

export interface ChatStreamHandlers {
  onDelta: (chunk: ChatDeltaEvent) => void;
  onDone: (payload: ChatDoneEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Opens the /chat SSE stream via fetch + ReadableStream and dispatches
 * parsed events to the given handlers. Returns an AbortController the caller
 * can use to cancel the stream (e.g. component unmount).
 *
 * `threadId` is forwarded to the backend so it can keep this conversation's history separate
 * from the user's other threads (see services/rag.py CONVERSATIONS) - passing the same
 * threadId on a later call resumes that thread's context.
 */
export function streamChat(message: string, threadId: string, handlers: ChatStreamHandlers): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const token = getAuthToken();
      const headers = new Headers({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      });
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message, thread_id: threadId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat stream failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, rest } = parseSSEBuffer(buffer);
        buffer = rest;

        for (const evt of events) {
          dispatchEvent(evt, handlers);
        }
      }

      // Flush any trailing buffered block once the stream ends without a
      // final blank line.
      if (buffer.trim()) {
        const { events } = parseSSEBuffer(`${buffer}\n\n`);
        for (const evt of events) {
          dispatchEvent(evt, handlers);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const error = err instanceof Error ? err : new Error("Unknown chat stream error");
      handlers.onError?.(error);
    }
  })();

  return controller;
}

function dispatchEvent(evt: ParsedSSEEvent, handlers: ChatStreamHandlers): void {
  if (evt.data === "[DONE]") return;

  try {
    if (evt.event === "done") {
      const payload = JSON.parse(evt.data) as ChatDoneEvent;
      handlers.onDone(payload);
    } else if (evt.event === "error") {
      handlers.onError?.(new Error(evt.data));
    } else {
      const payload = JSON.parse(evt.data) as ChatDeltaEvent;
      handlers.onDelta(payload);
    }
  } catch {
    // Malformed JSON payload — surface as a soft error but don't crash the
    // stream loop for a single bad frame.
    handlers.onError?.(new Error(`Malformed SSE payload for event "${evt.event}"`));
  }
}
