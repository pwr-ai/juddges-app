/** @jest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import SchemaDetailFailure from "@/components/schemas/SchemaDetailFailure";

describe("SchemaDetailFailure", () => {
  it("renders the application retry surface for service failures", () => {
    render(<SchemaDetailFailure status={503} />);
    expect(screen.getByText("Schema temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Schemas" })).toBeInTheDocument();
  });
});
