import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const chartProps: unknown[] = [];
jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (props: { items: { name: string; count: number }[]; onBarClick?: (name: string) => void }) => {
    chartProps.push(props);
    return (
      <ul data-testid="chart">
        {props.items.map((i) => (
          <li key={i.name}>{i.name}: {i.count}<button data-testid={`bar-${i.name}`} aria-label={`bar ${i.name}`} onClick={() => props.onBarClick?.(i.name)} /></li>
        ))}
      </ul>
    );
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FieldCard } = require("@/app/search/extractions/_components/FieldCard");

const categorical = { kind: "categorical" as const, multi: true, values: [{ value: "dismissed", count: 30 }, { value: "allowed", count: 15 }], other: 2, null: 3, covered: 47 };

describe("FieldCard", () => {
  beforeEach(() => { chartProps.length = 0; });

  it("renders values then other and missing, as counts", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" />);
    const items = (chartProps[0] as { items: { name: string; count: number }[] }).items;
    expect(items.map((i) => i.name)).toEqual(["dismissed", "allowed", "extraction.statsOther", "extraction.statsMissing"]);
    expect(items.map((i) => i.count)).toEqual([30, 15, 2, 3]);
    expect(screen.getByText("extraction.statsMultiNote")).toBeInTheDocument();
  });

  it("converts to percent of sample when asked", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="percent" />);
    const items = (chartProps[0] as { items: { count: number }[] }).items;
    expect(items[0].count).toBe(60);
  });

  it("value button reports the real value, and there is none for other/missing rows", () => {
    const onBarClick = jest.fn();
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" onBarClick={onBarClick} />);
    fireEvent.click(screen.getByRole("button", { name: "dismissed: 30" }));
    expect(onBarClick).toHaveBeenCalledWith("appeal_outcome", "dismissed");
    expect(screen.queryByRole("button", { name: /^extraction.statsOther: / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^extraction.statsMissing: / })).toBeNull();
    expect(onBarClick).toHaveBeenCalledTimes(1);
  });

  it("bar click reports the value; other/missing bars do not fire; no handler means no drill", () => {
    const onBarClick = jest.fn();
    const { unmount } = render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" onBarClick={onBarClick} />);
    fireEvent.click(screen.getByTestId("bar-dismissed"));
    expect(onBarClick).toHaveBeenCalledWith("appeal_outcome", "dismissed");
    fireEvent.click(screen.getByTestId("bar-extraction.statsOther"));
    fireEvent.click(screen.getByTestId("bar-extraction.statsMissing"));
    expect(onBarClick).toHaveBeenCalledTimes(1);
    unmount();
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" />);
    expect(() => fireEvent.click(screen.getByTestId("bar-dismissed"))).not.toThrow();
  });

  it("labels value buttons with a percent sign under yAxis percent", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="percent" onBarClick={jest.fn()} />);
    expect(screen.getByRole("button", { name: "dismissed: 60%" })).toBeInTheDocument();
  });

  it("offers every real value as a focusable button for keyboard users (#741)", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" onBarClick={jest.fn()} />);
    const list = screen.getByRole("list", { name: "extraction.statsPickValue" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["dismissed: 30", "allowed: 15"]);
    buttons[0].focus();
    expect(buttons[0]).toHaveFocus();
    expect(buttons[0]).toHaveAttribute("type", "button");
  });

  it("renders no value buttons when the field is not drillable", () => {
    render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" />);
    expect(screen.queryByRole("list", { name: "extraction.statsPickValue" })).toBeNull();
  });

  it("does not render an empty list for numeric buckets", () => {
    render(<FieldCard field="num_victims" aggregate={{ kind: "numeric", buckets: [{ lo: 0, hi: 1, count: 2 }], null: 0, covered: 2, min: 0, max: 1 }} sampleN={2} yAxis="count" onBarClick={jest.fn()} />);
    expect(screen.queryByRole("list", { name: "extraction.statsPickValue" })).toBeNull();
  });

  it("labels numeric buckets lo–hi and years ascending", () => {
    render(<FieldCard field="num_victims" aggregate={{ kind: "numeric", buckets: [{ lo: 0, hi: 1, count: 2 }, { lo: 1, hi: 2, count: 5 }], null: 0, covered: 7, min: 0, max: 2 }} sampleN={7} yAxis="count" />);
    expect((chartProps[0] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual(["0–1", "1–2"]);
    render(<FieldCard field="decision_date" aggregate={{ kind: "year", values: [{ value: "2018", count: 1 }, { value: "2019", count: 4 }], null: 0, covered: 5 }} sampleN={5} yAxis="count" />);
    expect((chartProps[1] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual(["2018", "2019"]);
  });

  it("flags model scores", () => {
    render(<FieldCard field="deep_complexity_score" aggregate={{ kind: "numeric", buckets: [], null: 0, covered: 0, min: null, max: null }} sampleN={0} yAxis="count" />);
    expect(screen.getByText(/statsModelScore/)).toBeInTheDocument();
  });

  it("renders its title as h3 by default and as h2 when headingLevel=h2", () => {
    const { rerender } = render(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
    rerender(<FieldCard field="appeal_outcome" aggregate={categorical} sampleN={50} yAxis="count" headingLevel="h2" />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});
