"use client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.app_metadata?.is_admin === true;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-6 p-4 w-fit rounded-2xl bg-destructive/10">
            <ShieldAlert className="size-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">You don&apos;t have permission to access the admin panel. Contact an administrator if you need access.</p>
          <Link href="/" className="text-sm font-medium text-primary hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
