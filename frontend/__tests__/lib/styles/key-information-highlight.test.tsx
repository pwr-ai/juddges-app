import { render, screen } from "@testing-library/react";

import { KeyInformation } from "@/lib/styles/components/key-information";

describe("KeyInformation highlight", () => {
  const metadata = {
    document_id: "d1",
    document_type: "judgment",
    language: "en",
    country: "UK",
    base_offender_gender: ["gender_female"],
    base_num_victims: 2,
  };

  it("marks highlighted cells and renders the caption + anchor", () => {
    render(
      <KeyInformation
        metadata={metadata}
        layout="grid"
        showAll
        title="Extracted Schema Fields"
        id="base-fields"
        highlightKeys={new Set(["base_offender_gender", "country"])}
        highlightCaption="2 fields matched your filter"
      />,
    );
    expect(document.getElementById("base-fields")).not.toBeNull();
    expect(screen.getByText("2 fields matched your filter")).toBeInTheDocument();
    const matched = document.querySelectorAll('[data-matched="true"]');
    expect(matched).toHaveLength(2);
    expect(document.querySelectorAll('[data-matched="false"]').length).toBeGreaterThan(0);
  });

  it("renders unchanged when highlightKeys is absent", () => {
    render(<KeyInformation metadata={metadata} layout="grid" showAll />);
    expect(document.querySelectorAll('[data-matched="true"]')).toHaveLength(0);
  });
});
