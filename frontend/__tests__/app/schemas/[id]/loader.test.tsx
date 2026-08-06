/** @jest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("@/app/schemas/[id]/client", () => ({
  __esModule: true,
  default: jest.fn(
    ({ initialSchema }: { initialSchema: { name: string; user?: { email: string } } }) => (
      <div data-testid="schema-client">
        {initialSchema.name} {initialSchema.user?.email}
      </div>
    )
  ),
}));
jest.mock("@/components/schemas/SchemaDetailFailure", () => ({
  __esModule: true,
  default: jest.fn(({ status }: { status: number }) => (
    <div data-testid="schema-failure">failure {status}</div>
  )),
}));

import SchemaDetailLoader from "@/app/schemas/[id]/loader";

const ID = "abcdef01-1234-4abc-8def-1234567890ab";
const SECOND_ID = "abcdef02-1234-4abc-8def-1234567890ab";
const schema = {
  id: ID,
  name: "Contract schema",
  description: null,
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published",
  is_verified: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
  user: { email: "creator@example.test" },
};

describe("SchemaDetailLoader", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows an explicit loading state, then renders the schema from the existing BFF", async () => {
    let resolveFetch!: (response: Response) => void;
    global.fetch = jest.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    );

    render(<SchemaDetailLoader schemaId={ID} />);

    expect(screen.getByRole("status", { name: "Loading schema" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(`/api/schemas/${ID}`, {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });

    resolveFetch(
      new Response(JSON.stringify(schema), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(await screen.findByTestId("schema-client")).toHaveTextContent(
      "Contract schema creator@example.test"
    );
  });

  it("renders the safe failure surface when the BFF is unavailable", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response("private details", { status: 503 }));

    render(<SchemaDetailLoader schemaId={ID} />);

    expect(await screen.findByTestId("schema-failure")).toHaveTextContent("failure 503");
    expect(screen.queryByText("private details")).not.toBeInTheDocument();
  });

  it("never renders the previous schema while a new route ID is loading", async () => {
    const pending = new Map<string, (response: Response) => void>();
    global.fetch = jest.fn(
      (url: string | URL | Request) =>
        new Promise<Response>((resolve) => pending.set(String(url), resolve))
    );
    const { rerender } = render(<SchemaDetailLoader schemaId={ID} />);

    pending.get(`/api/schemas/${ID}`)?.(
      new Response(JSON.stringify(schema), { status: 200 })
    );
    expect(await screen.findByText(/Contract schema/)).toBeInTheDocument();

    rerender(<SchemaDetailLoader schemaId={SECOND_ID} />);

    expect(screen.getByRole("status", { name: "Loading schema" })).toBeInTheDocument();
    expect(screen.queryByText(/Contract schema/)).not.toBeInTheDocument();

    pending.get(`/api/schemas/${SECOND_ID}`)?.(
      new Response(
        JSON.stringify({
          ...schema,
          id: SECOND_ID,
          name: "Second schema",
        }),
        { status: 200 }
      )
    );
    expect(await screen.findByText(/Second schema/)).toBeInTheDocument();
  });

  it("rejects malformed successful payloads without exposing their contents", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ unexpected: "future-secret-column" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SchemaDetailLoader schemaId={ID} />);

    await waitFor(() =>
      expect(screen.getByTestId("schema-failure")).toHaveTextContent("failure 502")
    );
    expect(screen.queryByText("future-secret-column")).not.toBeInTheDocument();
  });
});
