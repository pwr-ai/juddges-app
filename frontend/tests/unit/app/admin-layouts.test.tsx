import React, { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AdminLayout from "@/app/admin/layout";
import BlogAdminLayout from "@/app/blog/admin/layout";
import PublicationsAdminLayout from "@/app/publications/admin/layout";

const mockUseAuth = jest.fn();
const mockUsePathname = jest.fn();
const mockReplace = jest.fn();
const mockDataRequest = jest.fn();

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/components/admin/AdminSidebar", () => ({
  AdminSidebar: () => <aside>Admin sidebar</aside>,
}));

jest.mock("@/components/admin/AdminHeader", () => ({
  AdminHeader: () => <header>Admin header</header>,
}));

function DataChild() {
  useEffect(() => {
    mockDataRequest();
  }, []);

  return <div>Protected route data</div>;
}

const guardedLayouts = [
  ["admin", "/admin", AdminLayout],
  ["blog admin", "/blog/admin", BlogAdminLayout],
  ["publications admin", "/publications/admin", PublicationsAdminLayout],
] as const;

describe.each(guardedLayouts)("%s layout", (_name, pathname, Layout) => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue(pathname);
  });

  it("blocks child data requests while authentication is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    render(
      <Layout>
        <DataChild />
      </Layout>,
    );

    expect(screen.queryByText("Protected route data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects anonymous users without starting child data requests", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    render(
      <Layout>
        <DataChild />
      </Layout>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/auth/login?next=${encodeURIComponent(pathname)}`,
      );
    });
    expect(screen.queryByText("Protected route data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
  });

  it("denies signed-in non-admin users without starting child data requests", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", app_metadata: {} },
      loading: false,
    });

    render(
      <Layout>
        <DataChild />
      </Layout>,
    );

    expect(screen.getByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(screen.queryByText("Protected route data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
  });

  it("renders children and permits their data requests for admin users", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "admin-1", app_metadata: { is_admin: true } },
      loading: false,
    });

    render(
      <Layout>
        <DataChild />
      </Layout>,
    );

    expect(screen.getByText("Protected route data")).toBeInTheDocument();
    expect(mockDataRequest).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
