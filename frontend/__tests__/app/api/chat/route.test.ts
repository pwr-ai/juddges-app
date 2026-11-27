/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("@/lib/supabase/server");

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/chat/route";
import { ErrorCode } from "@/lib/errors";

global.fetch = jest.fn();

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";

function mockSupabaseAuth() {
  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
  };
  (createClient as jest.Mock).mockResolvedValue(supabase);
  return supabase;
}

function chatRequest(body: unknown = { question: "What is the ruling?" }) {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8004";
    process.env.BACKEND_API_KEY = "service-key";
    mockSupabaseAuth();
  });

  it("passes a backend 429 through as 429 with the backend's message", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          detail: {
            code: "LLM_RATE_LIMIT_EXCEEDED",
            message:
              "Too many AI requests. This limit protects the shared research budget — please try again later.",
          },
        })
      ),
    });

    const response = await POST(chatRequest());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(body.message).toBe(
      "Too many AI requests. This limit protects the shared research budget — please try again later."
    );
    expect(body.code).not.toBe(ErrorCode.INTERNAL_ERROR);
  });
  describe("backend payload", () => {
    function okBackend() {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ output: { answer: "ok" } }),
      });
    }

    function sentInput() {
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      return JSON.parse(init.body).input;
    }

    it("forwards chat history as LangChain messages typed by role", async () => {
      okBackend();

      await POST(
        chatRequest({
          question: "napisz to po polsku",
          chat_history: [
            { role: "human", content: "Is a discharge a conviction?" },
            { role: "ai", content: "A discharge does not erase the conviction." },
            { role: "user", content: "And the victim's wishes?" },
            { role: "assistant", content: "They are not decisive." },
            { role: "system", content: "ignored" },
          ],
        })
      );

      expect(sentInput().chat_history).toEqual([
        { type: "human", content: "Is a discharge a conviction?" },
        { type: "ai", content: "A discharge does not erase the conviction." },
        { type: "human", content: "And the victim's wishes?" },
        { type: "ai", content: "They are not decisive." },
      ]);
    });

    it("forwards max_documents and response_format from the request", async () => {
      okBackend();

      await POST(
        chatRequest({
          question: "What is the ruling?",
          max_documents: 25,
          response_format: "short",
        })
      );

      const input = sentInput();
      expect(input.max_documents).toBe(25);
      expect(input.response_format).toBe("short");
    });

    it("keeps the previous defaults when the request omits options", async () => {
      okBackend();

      await POST(chatRequest({ question: "What is the ruling?" }));

      expect(sentInput()).toEqual({
        question: "What is the ruling?",
        max_documents: 10,
        score_threshold: 0,
        chat_history: [],
        response_format: "detailed",
      });
    });
  });
});
