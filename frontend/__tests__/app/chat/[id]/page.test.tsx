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

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  useParams: jest.fn(() => ({ id: "legacy-client-id" })),
  usePathname: jest.fn(() => "/chat/legacy-client-id"),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
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

import { isValidChatId, resolveOwnedChatAccess } from "@/lib/server/chat-access";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ChatDetailPage from "@/app/chat/[id]/page";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const supabase = { auth: {}, from: jest.fn() };
const notFoundMock = notFound as unknown as jest.Mock;
const headersMock = headers as unknown as jest.Mock;

async function renderPage(chatId = CHAT_ID): Promise<React.ReactNode> {
  return (ChatDetailPage as unknown as (props: {
    params: Promise<{ id: string }>;
  }) => React.ReactNode | Promise<React.ReactNode>)({
    params: Promise.resolve({ id: chatId }),
  });
}

describe("/chat/[id] server access boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(supabase);
    (isValidChatId as jest.Mock).mockReturnValue(true);
    (resolveOwnedChatAccess as jest.Mock).mockResolvedValue({
      kind: "owner",
      userId: USER_ID,
    });
    headersMock.mockResolvedValue({
      get: jest.fn((name: string) =>
        name === "x-juddges-owned-chat-id" ? CHAT_ID : null,
      ),
    });
    notFoundMock.mockImplementation(() => {
      throw notFoundError;
    });
  });

  it("renders from the trusted middleware decision without another ownership lookup", async () => {
    const result = await renderPage();

    expect(result).toEqual(expect.objectContaining({
      props: expect.objectContaining({ chatId: CHAT_ID }),
    }));
    expect(createClient).not.toHaveBeenCalled();
    expect(resolveOwnedChatAccess).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("returns a 404 for an invalid chat id without reading trusted access", async () => {
    (isValidChatId as jest.Mock).mockReturnValue(false);

    await expect(renderPage("not-a-uuid")).rejects.toBe(notFoundError);
    expect(headersMock).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(resolveOwnedChatAccess).not.toHaveBeenCalled();
  });

  it.each([null, "another-chat-id"])(
    "rejects a missing or mismatched trusted middleware decision (%s)",
    async (trustedChatId) => {
      headersMock.mockResolvedValue({
        get: jest.fn(() => trustedChatId),
      });

      await expect(renderPage()).rejects.toBe(notFoundError);
      expect(createClient).not.toHaveBeenCalled();
      expect(resolveOwnedChatAccess).not.toHaveBeenCalled();
    },
  );
});
