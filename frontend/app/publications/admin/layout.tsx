import { AdminGuard } from "@/components/admin/AdminGuard";

export default function PublicationsAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
