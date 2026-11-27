import React from "react";

/**
 * Auth pages bypass AppLayoutWrapper (no sidebar / navbar), so this layout
 * supplies the page's single <main> landmark.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen w-full">
      {children}
    </main>
  );
}
