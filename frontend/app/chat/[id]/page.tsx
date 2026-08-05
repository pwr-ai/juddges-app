import { notFound, redirect } from "next/navigation";

import { resolveOwnedChatAccess } from "@/lib/server/chat-access";
import { createClient } from "@/lib/supabase/server";

import ChatDetailClient from "./ChatDetailClient";

type ChatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatDetailPage({
  params,
}: ChatDetailPageProps): Promise<React.JSX.Element> {
  const { id: chatId } = await params;
  const supabase = await createClient();
  const access = await resolveOwnedChatAccess(supabase, chatId);

  if (access.kind === "anonymous") {
    redirect(`/auth/login?next=${encodeURIComponent(`/chat/${chatId}`)}`);
  }
  if (access.kind === "not_found") {
    notFound();
  }

  return <ChatDetailClient chatId={chatId} />;
}
