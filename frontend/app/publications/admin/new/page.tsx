"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PublicationForm } from "@/components/publications/admin/publication-form";

export default function NewPublicationPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/publications/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Publication</h1>
          <p className="text-muted-foreground">
            Add a new research publication
          </p>
        </div>
      </div>

      <PublicationForm />
    </div>
  );
}
