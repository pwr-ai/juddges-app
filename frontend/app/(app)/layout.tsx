import { AuthenticatedLayout } from '@/components/layouts/AuthenticatedLayout';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
} 