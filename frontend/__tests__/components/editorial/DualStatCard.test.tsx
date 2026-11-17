import React from "react";
import { render, screen } from "@testing-library/react";
import { DualStatCard } from "@/components/editorial/DualStatCard";
import { formatNumber } from "@/lib/format-stats";

/**
 * Hydration error #418 (#880): bare toLocaleString() follows the runtime
 * default locale, so a pl-PL browser renders "6 050" where the en server
 * rendered "6,050". Simulate a pl-PL default and require locale-independent
 * output.
 */
describe("locale-stable number formatting", () => {
  const original = Number.prototype.toLocaleString;

  beforeEach(() => {
    Number.prototype.toLocaleString = function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions
    ) {
      return original.call(this, locales ?? "pl-PL", options);
    };
  });

  afterEach(() => {
    Number.prototype.toLocaleString = original;
  });

  it("formatNumber ignores the default locale", () => {
    expect(formatNumber(6050)).toBe("6,050");
  });

  it("DualStatCard renders numbers identically to the server", () => {
    render(<DualStatCard label="Judgments" ukValue={6050} plValue={1234567} />);
    expect(screen.getByText("6,050")).toBeInTheDocument();
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });
});
