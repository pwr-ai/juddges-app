/**
 * Tests for the WelcomeModal onboarding tour.
 *
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { WelcomeModal } from "@/components/onboarding/welcome-modal";

describe("WelcomeModal", () => {
  it("opens on the first step with the welcome content", () => {
    render(<WelcomeModal open onOpenChange={jest.fn()} />);

    expect(screen.getByText("Welcome to JuDDGES")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 7/)).toBeInTheDocument();
  });

  it("covers the features required by issue #111", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal open onOpenChange={jest.fn()} />);

    const titlesInOrder = [
      "Search",
      "Chat",
      "Collections",
      "Schema extraction",
      "Find your way around", // sidebar navigation
      "Professional Responsibility",
    ];

    for (const title of titlesInOrder) {
      await user.click(screen.getByRole("button", { name: /next/i }));
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("calls onComplete on the final step", async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    render(<WelcomeModal open onOpenChange={jest.fn()} onComplete={onComplete} />);

    // 6 Next clicks reach the last (7th) step, where the button becomes "Get Started".
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole("button", { name: /next/i }));
    }
    await user.click(screen.getByRole("button", { name: /get started/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
