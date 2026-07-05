import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat } from "@/api/sse";
import { useAuth } from "@/context/AuthContext";
import type { ChatMessage } from "@/types/chat";

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
}

function threadsStorageKey(userId: string): string {
  return `cortex.chat_threads.${userId}`;
}

function loadThreads(userId: string): ChatThread[] {
  try {
    const raw = localStorage.getItem(threadsStorageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as ChatThread[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveThreads(userId: string, threads: ChatThread[]): void {
  localStorage.setItem(threadsStorageKey(userId), JSON.stringify(threads));
}

function messagesStorageKey(userId: string): string {
  return `cortex.chat_messages.${userId}`;
}

function loadMessages(userId: string): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(messagesStorageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, ChatMessage[]>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMessages(userId: string, messagesByThread: Record<string, ChatMessage[]>): void {
  localStorage.setItem(messagesStorageKey(userId), JSON.stringify(messagesByThread));
}

function newThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initThreadsState(userId: string): { threads: ChatThread[]; activeThreadId: string } {
  const existing = loadThreads(userId);
  const first = existing[0];
  if (first) {
    return { threads: existing, activeThreadId: first.id };
  }
  const id = newThreadId();
  const threads: ChatThread[] = [{ id, title: "New chat", createdAt: Date.now() }];
  saveThreads(userId, threads);
  return { threads, activeThreadId: id };
}

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}`;
}

interface UseChatStreamResult {
  threads: ChatThread[];
  activeThreadId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => void;
  newThread: () => void;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
}

/**
 * Drives multiple independent chat threads per user. Each thread's conversation context is
 * kept server-side keyed by `${user.id}:${threadId}` (see services/rag.py CONVERSATIONS), so
 * switching back to an earlier thread and asking a follow-up genuinely resolves that thread's
 * context - this is real multi-thread continuity, not just a local transcript reset.
 *
 * The thread list (ids/titles) and per-thread message transcripts both persist to localStorage
 * per user, so a page refresh restores the full visible conversation. This is a client-side
 * cache only: the backend's own conversation store (rag.py CONVERSATIONS) that actually feeds
 * follow-up context is still in-memory, single-process, and reset on backend restart (see its
 * Redis upgrade-path note) - so after a backend restart the transcript still displays but the
 * model has lost that context.
 */
export function useChatStream(): UseChatStreamResult {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ChatMessage[]>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    const initial = initThreadsState(userId);
    setThreads(initial.threads);
    setActiveThreadId(initial.activeThreadId);
    setMessagesByThread(loadMessages(userId));
  }, [userId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Skip persisting while a message is still streaming in, so we don't do a
  // localStorage write on every delta chunk - only once a response settles.
  useEffect(() => {
    const isAnyStreaming = Object.values(messagesByThread).some((msgs) => msgs.some((m) => m.isStreaming));
    if (isAnyStreaming) return;
    saveMessages(userId, messagesByThread);
  }, [messagesByThread, userId]);

  const messages = messagesByThread[activeThreadId] ?? [];

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current || !activeThreadId) return;
      const threadId = activeThreadId;

      const userMessage: ChatMessage = { id: nextMessageId(), role: "user", content: trimmed };
      const assistantId = nextMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessagesByThread((prev) => ({
        ...prev,
        [threadId]: [...(prev[threadId] ?? []), userMessage, assistantMessage],
      }));
      setIsStreaming(true);

      // First message in a thread becomes its title (truncated) so the switcher stays legible.
      setThreads((prev) => {
        const next = prev.map((t) => (t.id === threadId && t.title === "New chat" ? { ...t, title: trimmed.slice(0, 48) } : t));
        saveThreads(userId, next);
        return next;
      });

      const updateAssistant = (updater: (m: ChatMessage) => ChatMessage) => {
        setMessagesByThread((prev) => ({
          ...prev,
          [threadId]: (prev[threadId] ?? []).map((m) => (m.id === assistantId ? updater(m) : m)),
        }));
      };

      const controller = streamChat(trimmed, threadId, {
        onDelta: (chunk) => {
          updateAssistant((m) => ({ ...m, content: m.content + chunk.delta }));
        },
        onDone: (payload) => {
          updateAssistant((m) => ({
            ...m,
            isStreaming: false,
            citations: payload.citations,
            usage: payload.usage ?? undefined,
            latencyMs: payload.latency_ms,
          }));
          setIsStreaming(false);
          abortRef.current = null;
        },
        onError: (error) => {
          updateAssistant((m) => ({ ...m, isStreaming: false, error: error.message || "Something went wrong." }));
          setIsStreaming(false);
          abortRef.current = null;
        },
      });

      abortRef.current = controller;
    },
    [activeThreadId, userId],
  );

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    const id = newThreadId();
    setThreads((prev) => {
      const next = [{ id, title: "New chat", createdAt: Date.now() }, ...prev];
      saveThreads(userId, next);
      return next;
    });
    setActiveThreadId(id);
  }, [userId]);

  const switchThread = useCallback((id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setActiveThreadId(id);
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      const remaining = threads.filter((t) => t.id !== id);
      const fallback: ChatThread = { id: newThreadId(), title: "New chat", createdAt: Date.now() };
      const finalThreads = remaining.length > 0 ? remaining : [fallback];
      const nextActiveId = finalThreads[0]?.id ?? fallback.id;
      saveThreads(userId, finalThreads);
      setThreads(finalThreads);

      setMessagesByThread((prev) => {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });

      if (id === activeThreadId) {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
        setActiveThreadId(nextActiveId);
      }
    },
    [threads, activeThreadId, userId],
  );

  return { threads, activeThreadId, messages, isStreaming, sendMessage, newThread, switchThread, deleteThread };
}
