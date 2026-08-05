import { render, screen } from "@testing-library/react";
import BlogAdminLayout from "@/app/blog/admin/layout";

jest.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="admin-guard">{children}</section>
  ),
}));

describe("blog admin layout", () => {
  it("wraps the entire subtree in the shared admin guard", () => {
    render(
      <BlogAdminLayout>
        <div>Blog admin child</div>
      </BlogAdminLayout>,
    );

    expect(screen.getByTestId("admin-guard")).toContainElement(
      screen.getByText("Blog admin child"),
    );
  });
});
