import { CitationMarkdown } from "@/components/chat/CitationMarkdown";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import type { ChatMessage } from "@/types/chat";

export function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col md:max-w-[70%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-3 shadow-sm ${
            isUser
              ? "bg-brand-600 text-white"
              : "border border-slate-200 bg-white text-slate-900"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          ) : message.content ? (
            <CitationMarkdown content={message.content} />
          ) : message.isStreaming ? (
            <TypingIndicator />
          ) : null}

          {message.error && (
            <p className="mt-2 text-xs font-medium text-red-600">{message.error}</p>
          )}

          {message.isStreaming && message.content && (
            <span className="mt-1 inline-block h-3 w-1.5 animate-pulse bg-slate-400" aria-hidden="true" />
          )}
        </div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <SourcesPanel citations={message.citations} />
        )}

        {!isUser && message.usage && (
          <p className="mt-1 text-[11px] text-slate-400">
            {message.usage.total_tokens} tokens
            {typeof message.latencyMs === "number" ? ` · ${message.latencyMs}ms` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
