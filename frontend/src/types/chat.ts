import type { ChatCitation, ChatUsage } from "@/types/api";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  isStreaming?: boolean;
  citations?: ChatCitation[];
  usage?: ChatUsage;
  latencyMs?: number;
  error?: string;
}
