/**
 * Every result row on /search/extractions linked to /judgments/<id>, a route
 * that does not exist, so every click 404'd (APP_STATUS_2026-08-21 §5d). The
 * judgment reader lives at /documents/[id].
 */
import { render, screen } from "@testing-library/react";
import React from "react";

import { ResultList } from "@/app/search/extractions/page";

describe("extraction search result rows", () => {
  it("links each row to the judgment reader", () => {
    render(
      <ResultList
        rows={[
          {
            id: "3f2c1a9e-0000-4000-8000-000000000001",
            case_number: "II AKa 12/21",
            title: null,
            jurisdiction: "PL",
            decision_date: "2021-03-04",
            extracted_data: {},
          },
        ]}
        isLoading={false}
        hasActiveFilters={false}
        onClearAll={() => {}}
        urlState={{ filters: {} }}
      />
    );

    expect(screen.getByRole("link", { name: /II AKa 12\/21/ })).toHaveAttribute(
      "href",
      "/documents/3f2c1a9e-0000-4000-8000-000000000001"
    );
  });
});
