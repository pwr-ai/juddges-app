import { render, screen, fireEvent } from "@testing-library/react";
import { EditorialPagination } from "@/components/editorial/EditorialPagination";

describe("EditorialPagination", () => {
  it("returns null when totalPages <= 1", () => {
    const { container } = render(
      <EditorialPagination currentPage={1} totalPages={1} onPageChange={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders prev, next, and page number buttons", () => {
    const onPageChange = jest.fn();
    render(
      <EditorialPagination currentPage={2} totalPages={5} onPageChange={onPageChange} />
    );

    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 2")).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByLabelText("Page 3"));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders item info when totalItems and itemsPerPage are provided", () => {
    render(
      <EditorialPagination
        currentPage={1}
        totalPages={3}
        onPageChange={jest.fn()}
        totalItems={25}
        itemsPerPage={10}
        itemLabel="documents"
      />
    );
    expect(screen.getByText("Showing 1–10 of 25 documents")).toBeInTheDocument();
  });
});
