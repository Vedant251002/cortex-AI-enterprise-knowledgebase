import { describe, expect, it } from "vitest";
import { slugifyForFilename, threadToMarkdown } from "./exportChat";
import type { ChatMessage } from "@/types/chat";

describe("slugifyForFilename", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyForFilename("What is the Q4 budget?")).toBe("what-is-the-q4-budget");
  });

  it("falls back to 'chat' for an empty/unslugifiable title", () => {
    expect(slugifyForFilename("")).toBe("chat");
    expect(slugifyForFilename("???")).toBe("chat");
  });
});

describe("threadToMarkdown", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "What is the Q4 budget?" },
    {
      id: "2",
      role: "assistant",
      content: "The Q4 budget is $42.7M.",
      citations: [{ document_name: "q4-budget-memo.pdf", page_number: 1, excerpt: "Total budget: $42.7M" }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      latencyMs: 850,
    },
  ];

  it("includes the thread title as a heading", () => {
    expect(threadToMarkdown("Budget question", messages)).toContain("# Budget question");
  });

  it("renders each message under a speaker heading", () => {
    const md = threadToMarkdown("Thread", messages);
    expect(md).toContain("## You");
    expect(md).toContain("What is the Q4 budget?");
    expect(md).toContain("## Assistant");
    expect(md).toContain("The Q4 budget is $42.7M.");
  });

  it("includes citations as a numbered source list", () => {
    const md = threadToMarkdown("Thread", messages);
    expect(md).toContain("**Sources:**");
    expect(md).toContain("1. q4-budget-memo.pdf, p.1 — Total budget: $42.7M");
  });

  it("includes token usage for assistant messages", () => {
    const md = threadToMarkdown("Thread", messages);
    expect(md).toContain("120 tokens");
    expect(md).toContain("850ms");
  });
});
