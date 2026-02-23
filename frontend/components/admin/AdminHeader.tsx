"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/lib/styles/components";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/users": "User Management",
  "/admin/documents": "Document Management",
  "/admin/content": "Content Management",
  "/admin/search-queries": "Search Analytics",
  "/admin/system": "System Settings",
};

export function AdminHeader() {
  const pathname = usePathname() || "/admin";
  const { user } = useAuth();
  const title = pageTitles[pathname] || "Admin";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card px-6 flex items-center justify-between">
      <div>
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{user?.email}</span>
        <UserAvatar size="sm" />
      </div>
    </header>
  );
}
