import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ScaleSlider } = require("@/app/search/extractions/_components/ScaleSlider");

describe("ScaleSlider", () => {
  it("disables stops above the cohort size and marks the current one", () => {
    const onChange = jest.fn();
    render(<ScaleSlider cohortTotal={320} sampleSize={100} seed={7} onChange={onChange} onReshuffle={() => {}} />);
    expect(screen.getByRole("radio", { name: "10" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "100" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1,000" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "5,000" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "extraction.statsAll" })).toBeEnabled();
  });

  it("displays a stop larger than the cohort as 'all' (disabled, unchecked, no reshuffle)", () => {
    render(<ScaleSlider cohortTotal={320} sampleSize={1000} seed={7} onChange={() => {}} onReshuffle={() => {}} />);
    expect(screen.getByRole("radio", { name: "extraction.statsAll" })).toBeChecked();
    const stop = screen.getByRole("radio", { name: "1,000" });
    expect(stop).toBeDisabled();
    expect(stop).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /statsReshuffle/ })).not.toBeInTheDocument();
  });

  it("reports a stop as a number and 'all' as undefined", () => {
    const onChange = jest.fn();
    render(<ScaleSlider cohortTotal={9000} sampleSize={undefined} seed={7} onChange={onChange} onReshuffle={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "1,000" }));
    expect(onChange).toHaveBeenCalledWith(1000);
    fireEvent.click(screen.getByRole("radio", { name: "extraction.statsAll" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows the seed and reshuffles only when sampling", () => {
    const onReshuffle = jest.fn();
    const { rerender } = render(<ScaleSlider cohortTotal={9000} sampleSize={50} seed={42} onChange={() => {}} onReshuffle={onReshuffle} />);
    fireEvent.click(screen.getByRole("button", { name: /statsReshuffle/ }));
    expect(onReshuffle).toHaveBeenCalled();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    rerender(<ScaleSlider cohortTotal={9000} sampleSize={undefined} seed={42} onChange={() => {}} onReshuffle={onReshuffle} />);
    expect(screen.queryByRole("button", { name: /statsReshuffle/ })).not.toBeInTheDocument();
  });
});
