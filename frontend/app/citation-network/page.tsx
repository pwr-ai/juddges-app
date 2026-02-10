'use client';

import CitationNetwork from "@/components/CitationNetwork";
import { Breadcrumb } from "@/lib/styles/components";

export default function CitationNetworkPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-[1920px] min-h-screen bg-background text-foreground">
      <Breadcrumb
        items={[
          { label: 'Analysis', href: '/document-vis' },
          { label: 'Citation Network' }
        ]}
        className="mb-6"
      />
      <CitationNetwork />
    </div>
  );
}
