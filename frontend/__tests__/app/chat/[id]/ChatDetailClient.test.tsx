/**
 * @jest-environment jsdom
 */

jest.mock("@/contexts/ChatContext", () => ({
  useChatContext: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));
jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));
jest.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock("@/lib/styles/components", () => ({
  ChatInterface: () => <div>live chat interface</div>,
  LoadingIndicator: ({ message }: { message: string }) => <div>{message}</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { render, screen, waitFor } from "@testing-library/react";
import { usePathname } from "next/navigation";

import ChatDetailClient from "@/app/chat/[id]/ChatDetailClient";
import { useChatContext } from "@/contexts/ChatContext";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";

function mockChatContext(
  loadExistingChat: jest.Mock,
): void {
  (useChatContext as jest.Mock).mockReturnValue({
    loadExistingChat,
    chatId: null,
    messages: [],
    isLoadingChat: false,
    deletingChats: new Set(),
  });
}

describe("ChatDetailClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue(`/chat/${CHAT_ID}`);
  });

  it("loads the server-approved chat id and preserves the live client interface", async () => {
    const loadExistingChat = jest.fn().mockResolvedValue({ success: true });
    mockChatContext(loadExistingChat);

    render(<ChatDetailClient chatId={CHAT_ID} />);

    expect(screen.getByText("Loading conversation...")).toBeInTheDocument();
    await waitFor(() => expect(loadExistingChat).toHaveBeenCalledWith(CHAT_ID));
    await waitFor(() => {
      expect(screen.getByText("live chat interface")).toBeInTheDocument();
    });
  });

  it("keeps the client fallback when a chat disappears after server render", async () => {
    const loadExistingChat = jest.fn().mockResolvedValue({
      success: false,
      notFound: true,
    });
    mockChatContext(loadExistingChat);

    render(<ChatDetailClient chatId={CHAT_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Chat Not Found")).toBeInTheDocument();
    });
  });
});
