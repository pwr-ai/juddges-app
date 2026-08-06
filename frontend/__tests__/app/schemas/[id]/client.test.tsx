/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/components/schemas/SchemaFieldsTable", () => ({
  SchemaFieldsTable: () => <div data-testid="schema-fields" />,
}));
jest.mock("@/lib/styles/components/schemas/SchemaPreview", () => ({
  SchemaPreview: () => <div data-testid="schema-preview" />,
}));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: jest.fn() }));

import SchemaDetailClient from "@/app/schemas/[id]/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

const mockUseAuth = jest.mocked(useAuth);
const mockUseRouter = jest.mocked(useRouter);
const push = jest.fn();
const fetchMock = jest.fn();
const clickAnchor = jest
  .spyOn(HTMLAnchorElement.prototype, "click")
  .mockImplementation(() => undefined);

const schema = {
  id: "abcdef01-1234-4abc-8def-1234567890ab",
  name: "Contract schema",
  description: "Extract contract terms",
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published" as const,
  is_verified: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
  user: { email: "creator@example.test" },
};

describe("SchemaDetailClient", () => {
  beforeEach(() => {
    push.mockReset();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    mockUseRouter.mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  });

  afterAll(() => clickAnchor.mockRestore());

  it("keeps owner actions and renders the enriched creator without a hydration fetch", () => {
    mockUseAuth.mockReturnValue({ user: { id: "owner-1" } } as ReturnType<typeof useAuth>);

    render(<SchemaDetailClient initialSchema={schema} />);

    expect(screen.getByText("creator@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit in Studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure Extraction" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit in Studio" }));
    expect(push).toHaveBeenCalledWith(`/schema-chat?schemaId=${schema.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(push).toHaveBeenCalledWith(
      `/schema-chat?schemaId=${schema.id}&duplicate=true`
    );
    fireEvent.click(screen.getByRole("button", { name: "Configure Extraction" }));
    expect(push).toHaveBeenCalledWith(`/extract?schema=${schema.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(clickAnchor).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides owner-only edit and delete while retaining safe shared actions", () => {
    mockUseAuth.mockReturnValue({ user: { id: "another-user" } } as ReturnType<typeof useAuth>);

    render(<SchemaDetailClient initialSchema={schema} />);

    expect(screen.queryByRole("button", { name: "Edit in Studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure Extraction" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
