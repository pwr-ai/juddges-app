import React, { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminGuard } from "@/components/admin/AdminGuard";

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

function DataChild() {
  useEffect(() => {
    mockDataRequest();
  }, []);

  return <div>Protected data</div>;
}

describe("AdminGuard", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/blog/admin/draft-1");
  });

  it("keeps children and their data requests blocked while auth is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    render(
      <AdminGuard>
        <DataChild />
      </AdminGuard>,
    );

    expect(screen.queryByText("Protected data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects anonymous users to login with the guarded path in next", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    render(
      <AdminGuard>
        <DataChild />
      </AdminGuard>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/auth/login?next=%2Fblog%2Fadmin%2Fdraft-1",
      );
    });
    expect(screen.queryByText("Protected data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
  });

  it("denies signed-in non-admin users without rendering children", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", app_metadata: {} },
      loading: false,
    });

    render(
      <AdminGuard>
        <DataChild />
      </AdminGuard>,
    );

    expect(screen.getByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(screen.queryByText("Protected data")).not.toBeInTheDocument();
    expect(mockDataRequest).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders children only for an admin user", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "admin-1", app_metadata: { is_admin: true } },
      loading: false,
    });

    render(
      <AdminGuard>
        <DataChild />
      </AdminGuard>,
    );

    expect(screen.getByText("Protected data")).toBeInTheDocument();
    expect(mockDataRequest).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
