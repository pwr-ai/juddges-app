import { render, screen, fireEvent } from "@testing-library/react";

import { SchemaFieldsTable } from "@/components/schemas/SchemaFieldsTable";
import type { FlatField } from "@/lib/schema-utils";

const field = (name: string, type: string): FlatField => ({
  name,
  path: name,
  type,
  required: false,
  description: `${name} description`,
  validation: "",
  level: 0,
});

const fields = [field("zebra", "string"), field("alpha", "number"), field("mango", "boolean")];

const firstColumnValues = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr")).map((row) =>
    row.querySelector("td")?.textContent?.trim(),
  );

describe("SchemaFieldsTable", () => {
  it("renders one row per field", () => {
    const { container } = render(<SchemaFieldsTable fields={fields} />);

    expect(firstColumnValues(container)).toEqual(["Zebra", "Alpha", "Mango"]);
  });

  it("sorts rows when the field name header is clicked", () => {
    const { container } = render(<SchemaFieldsTable fields={fields} />);

    fireEvent.click(screen.getByText("Field Name"));

    expect(firstColumnValues(container)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("narrows rows with the search box", () => {
    const { container } = render(<SchemaFieldsTable fields={fields} />);

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "mango" },
    });

    expect(firstColumnValues(container)).toEqual(["Mango"]);
  });
});
