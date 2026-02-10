import type { Message } from "@/types/message";

const RESPONSE_ROLES: Message["role"][] = ["assistant"];

export function collapseMessages(messages: Message[]): Message[] {
  const lastAssistantByUserIdx: Record<number, number> = {};

  for (let i = 0; i < messages.length; i++) {
    if (!RESPONSE_ROLES.includes(messages[i].role)) continue;

    let u = i - 1;
    while (u >= 0 && messages[u].role !== "user") u--;
    if (u >= 0) lastAssistantByUserIdx[u] = i;
  }

  return messages.filter((m, i) => {
    if (m.role === "user") return true;
    if (!RESPONSE_ROLES.includes(m.role)) return true;
    let u = i - 1;
    while (u >= 0 && messages[u].role !== "user") u--;
    if (u < 0) return true;
    return lastAssistantByUserIdx[u] === i;
  });
}

