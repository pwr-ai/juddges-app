/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/server");
jest.mock("next/navigation", () => ({
  notFound:
    jest.requireActual("next/dist/client/components/not-found").notFound,
  redirect:
    jest.requireActual("next/dist/client/components/redirect").redirect,
}));
jest.mock("@/lib/server/chat-access", () => {
  const actual = jest.requireActual("@/lib/server/chat-access");
  return { ...actual, resolveOwnedChatAccess: jest.fn() };
});
jest.mock("@/app/chat/[id]/ChatDetailClient", () => ({
  __esModule: true,
  default: () => null,
}));

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback";

import ChatDetailPage from "@/app/chat/[id]/page";
import { resolveOwnedChatAccess } from "@/lib/server/chat-access";
import { createClient } from "@/lib/supabase/server";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";

async function requestPageThroughHttpBoundary(): Promise<Response> {
  const server = createServer(async (_request, response) => {
    try {
      await ChatDetailPage({ params: Promise.resolve({ id: CHAT_ID }) });
      response.statusCode = 200;
      response.end("rendered");
    } catch (error) {
      const isHttpFallback = isHTTPAccessFallbackError(error);
      response.statusCode = isHttpFallback
        ? getAccessFallbackHTTPStatus(error)
        : 500;
      response.end(
        isHttpFallback
          ? ""
          : JSON.stringify({
              message: error instanceof Error ? error.message : String(error),
              digest:
                typeof error === "object" && error !== null && "digest" in error
                  ? error.digest
                  : null,
            }),
      );
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}/chat/${CHAT_ID}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("/chat/[id] exact HTTP status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue({ auth: {}, from: jest.fn() });
  });

  it.each(["missing", "hidden by RLS for another user"])(
    "returns an actual HTTP 404 when the chat is %s",
    async () => {
      (resolveOwnedChatAccess as jest.Mock).mockResolvedValue({ kind: "not_found" });

      const response = await requestPageThroughHttpBoundary();

      expect({ status: response.status, body: await response.text() }).toEqual({
        status: 404,
        body: "",
      });
    },
  );
});
