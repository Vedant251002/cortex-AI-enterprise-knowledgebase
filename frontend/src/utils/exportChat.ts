import type { ChatMessage } from "@/types/chat";
import { formatNumber } from "@/utils/format";

/** Renders a chat thread's transcript as a Markdown document, citations included. */
export function threadToMarkdown(threadTitle: string, messages: ChatMessage[]): string {
  const lines: string[] = [`# ${threadTitle || "Chat export"}`, "", `_Exported ${new Date().toLocaleString()}_`, ""];

  for (const message of messages) {
    const speaker = message.role === "user" ? "You" : "Assistant";
    lines.push(`## ${speaker}`, "", message.content || "_(no response)_", "");

    if (message.citations && message.citations.length > 0) {
      lines.push("**Sources:**", "");
      message.citations.forEach((citation, index) => {
        const page = citation.page_number != null ? `, p.${citation.page_number}` : "";
        lines.push(`${index + 1}. ${citation.document_name}${page} — ${citation.excerpt}`);
      });
      lines.push("");
    }

    if (message.usage) {
      lines.push(`_${formatNumber(message.usage.total_tokens)} tokens${message.latencyMs ? ` · ${message.latencyMs}ms` : ""}_`, "");
    }
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Slugifies a thread title into a safe filename fragment. */
export function slugifyForFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "chat";
}
