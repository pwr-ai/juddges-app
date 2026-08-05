import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { OWNED_CHAT_ID_HEADER } from "@/lib/chat-route-contract";
import { isValidChatId } from "@/lib/server/chat-access";

import ChatDetailClient from "./ChatDetailClient";

type ChatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatDetailPage({
  params,
}: ChatDetailPageProps): Promise<React.JSX.Element> {
  const { id: chatId } = await params;
  if (!isValidChatId(chatId)) {
    notFound();
  }

  const requestHeaders = await headers();
  if (requestHeaders.get(OWNED_CHAT_ID_HEADER) !== chatId) {
    notFound();
  }

  return <ChatDetailClient chatId={chatId} />;
}
