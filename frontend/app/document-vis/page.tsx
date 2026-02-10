'use client';

import DocumentVisualization from "@/components/DocumentVisualization";
import { Breadcrumb } from "@/lib/styles/components";

export default function DocumentVisPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-[1920px] min-h-screen bg-background text-foreground">
      <Breadcrumb
        items={[
          { label: 'Documents', href: '/search' },
          { label: 'Network Visualization' }
        ]}
        className="mb-6"
      />
      <DocumentVisualization />
    </div>
  );
} 