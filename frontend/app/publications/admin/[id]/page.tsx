"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PublicationForm } from "@/components/publications/admin/publication-form";
import { PublicationWithResources } from "@/types/publication";
import { getPublication } from "@/lib/api/publications";

interface EditPublicationPageProps {
  params: Promise<{ id: string }>;
}

export default function EditPublicationPage({ params }: EditPublicationPageProps) {
  const { id } = use(params);
  const { user } = useAuth();
  const userId = user?.id;
  const [publication, setPublication] = useState<PublicationWithResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPublication = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPublication(id);

      // Ownership is enforced server-side on PUT/DELETE (#420). The previous
      // check here read data.userId, which PublicationWithResources does not
      // carry, so it never fired — and a client-side check would not be a
      // control regardless. A save by a non-owner surfaces as a 403 from the
      // API and lands in the catch below.
      setPublication(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load publication");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (userId && id) {
      loadPublication();
    }
  }, [userId, id, loadPublication]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/publications/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Edit Publication</h1>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!publication) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/publications/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Edit Publication</h1>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Publication not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/publications/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Publication</h1>
          <p className="text-muted-foreground truncate max-w-xl">
            {publication.title}
          </p>
        </div>
      </div>

      <PublicationForm publication={publication} />
    </div>
  );
}
