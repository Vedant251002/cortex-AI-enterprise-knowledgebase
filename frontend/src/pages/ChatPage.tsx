import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EmptyState } from "@/components/EmptyState";
import { useChatStream } from "@/hooks/useChatStream";
import { useAuth } from "@/context/AuthContext";
import { downloadMarkdown, slugifyForFilename, threadToMarkdown } from "@/utils/exportChat";

const MAX_VISIBLE_THREADS = 5;

export function ChatPage(): JSX.Element {
  const { user } = useAuth();
  const { threads, activeThreadId, messages, isStreaming, sendMessage, newThread, switchThread, deleteThread } =
    useChatStream();
  const [draft, setDraft] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showThreadOverflow, setShowThreadOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visibleThreads = threads.slice(0, MAX_VISIBLE_THREADS);
  const overflowThreads = threads.slice(MAX_VISIBLE_THREADS);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!draft.trim() || isStreaming) return;
    sendMessage(draft);
    setDraft("");
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const activeThreadTitle = activeThread?.title ?? "Chat export";

  function handleDownloadMarkdown(): void {
    downloadMarkdown(`${slugifyForFilename(activeThreadTitle)}.md`, threadToMarkdown(activeThreadTitle, messages));
    setShowExportMenu(false);
  }

  function handlePrintToPdf(): void {
    setShowExportMenu(false);
    window.print();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Chat</h1>
          <p className="text-sm text-slate-500">
            Ask questions across your accessible knowledge base
            {user ? ` (${user.categories.join(", ")})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={messages.length === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Export this conversation"
            >
              Export ▾
            </button>
            {showExportMenu && (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Download as Markdown
                </button>
                <button
                  type="button"
                  onClick={handlePrintToPdf}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Print / Save as PDF
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={newThread}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            title="Starts a new, independent conversation thread. Your other threads stay intact and can be resumed at any time."
          >
            New chat
          </button>
        </div>
      </div>

      {threads.length > 1 && (
        <div className="no-print mb-3 flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Chat threads">
            {visibleThreads.map((thread) => (
              <div
                key={thread.id}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-1.5 pl-3 pr-1.5 text-xs font-medium transition-colors ${
                  thread.id === activeThreadId
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={thread.id === activeThreadId}
                  onClick={() => switchThread(thread.id)}
                  className="max-w-[10rem] truncate"
                  title={thread.title}
                >
                  {thread.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteThread(thread.id)}
                  title="Delete this chat"
                  aria-label={`Delete chat "${thread.title}"`}
                  className={`rounded-full px-1 leading-none ${
                    thread.id === activeThreadId ? "text-white/80 hover:text-white" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {overflowThreads.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowThreadOverflow((v) => !v)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                +{overflowThreads.length} more
              </button>
              {showThreadOverflow && (
                <div className="absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {overflowThreads.map((thread) => (
                    <div key={thread.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          switchThread(thread.id);
                          setShowThreadOverflow(false);
                        }}
                        className="flex-1 truncate text-left text-sm text-slate-700"
                        title={thread.title}
                      >
                        {thread.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteThread(thread.id)}
                        title="Delete this chat"
                        aria-label={`Delete chat "${thread.title}"`}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        {messages.length === 0 ? (
          <EmptyState
            title="Start a conversation"
            description="Ask about anything in the documents you have access to. Responses stream in real time with cited sources."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="no-print mt-4 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
            }
          }}
          placeholder="Ask a question..."
          rows={2}
          disabled={isStreaming}
          className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={isStreaming || !draft.trim()}
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isStreaming ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
