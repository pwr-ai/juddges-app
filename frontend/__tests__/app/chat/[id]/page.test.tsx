/**
 * @jest-environment jsdom
 */

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    useEffect: jest.fn(),
    useRef: jest.fn((value) => ({ current: value })),
    useState: jest.fn((value) => [value, jest.fn()]),
  };
});

const notFoundError = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const redirectError = { digest: "NEXT_REDIRECT;replace;/auth/login;307;" };

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
  useParams: jest.fn(() => ({ id: "legacy-client-id" })),
  usePathname: jest.fn(() => "/chat/legacy-client-id"),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

jest.mock("@/contexts/ChatContext", () => ({
  useChatContext: jest.fn(() => ({
    loadExistingChat: jest.fn(),
    chatId: null,
    messages: [],
    isLoadingChat: false,
    deletingChats: new Set(),
  })),
}));

jest.mock("framer-motion", () => ({
  motion: { div: "div" },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock("@/lib/supabase/server");
jest.mock("@/lib/server/chat-access", () => ({
  isValidChatId: jest.fn(),
  resolveOwnedChatAccess: jest.fn(),
}));

import { AppError, DatabaseError, ErrorCode } from "@/lib/errors";
import { isValidChatId, resolveOwnedChatAccess } from "@/lib/server/chat-access";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ChatDetailPage from "@/app/chat/[id]/page";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const supabase = { auth: {}, from: jest.fn() };
const notFoundMock = notFound as unknown as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;

async function renderPage(): Promise<React.ReactNode> {
  return (ChatDetailPage as unknown as (props: {
    params: Promise<{ id: string }>;
  }) => React.ReactNode | Promise<React.ReactNode>)({
    params: Promise.resolve({ id: CHAT_ID }),
  });
}

describe("/chat/[id] server access boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(supabase);
    (isValidChatId as jest.Mock).mockReturnValue(true);
    notFoundMock.mockImplementation(() => {
      throw notFoundError;
    });
    redirectMock.mockImplementation(() => {
      throw redirectError;
    });
  });

  it("redirects an anonymous request to login and preserves the chat URL", async () => {
    (resolveOwnedChatAccess as jest.Mock).mockResolvedValue({ kind: "anonymous" });

    await expect(renderPage()).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      `/auth/login?next=${encodeURIComponent(`/chat/${CHAT_ID}`)}`,
    );
  });

  it("renders the client chat flow for the owner", async () => {
    (resolveOwnedChatAccess as jest.Mock).mockResolvedValue({
      kind: "owner",
      userId: USER_ID,
    });

    const result = await renderPage();

    expect(resolveOwnedChatAccess).toHaveBeenCalledWith(supabase, CHAT_ID);
    expect(result).toEqual(expect.objectContaining({
      props: expect.objectContaining({ chatId: CHAT_ID }),
    }));
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("returns a 404 for an invalid chat id without touching Supabase", async () => {
    (isValidChatId as jest.Mock).mockReturnValue(false);

    await expect(renderPage()).rejects.toBe(notFoundError);
    expect(createClient).not.toHaveBeenCalled();
    expect(resolveOwnedChatAccess).not.toHaveBeenCalled();
  });

  it.each(["missing", "inaccessible to the current user"])(
    "invokes the Next.js 404 boundary when the chat is %s",
    async () => {
      (resolveOwnedChatAccess as jest.Mock).mockResolvedValue({ kind: "not_found" });

      await expect(renderPage()).rejects.toBe(notFoundError);
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    },
  );

  it("does not turn a database failure into a 404", async () => {
    const databaseError = new DatabaseError("Database unavailable");
    (resolveOwnedChatAccess as jest.Mock).mockRejectedValue(databaseError);

    await expect(renderPage()).rejects.toBe(databaseError);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("does not turn a timeout into a 404", async () => {
    const timeoutError = new AppError(
      "Chat lookup timed out",
      ErrorCode.DATABASE_UNAVAILABLE,
      504,
    );
    (resolveOwnedChatAccess as jest.Mock).mockRejectedValue(timeoutError);

    await expect(renderPage()).rejects.toBe(timeoutError);
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
