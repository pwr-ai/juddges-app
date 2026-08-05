import { AdminGuard } from "@/components/admin/AdminGuard";

export default function BlogAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
