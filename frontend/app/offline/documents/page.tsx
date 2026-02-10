"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Trash2, WifiOff, ArrowLeft } from "lucide-react";
import {
  PageContainer,
  SectionHeader,
  SecondaryButton,
} from "@/lib/styles/components";
import { getOfflineDocuments, removeOfflineDocument, type OfflineDocument } from "@/lib/offline-documents";

export default function OfflineDocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<OfflineDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOfflineDocuments().then((docs) => {
      setDocuments(docs);
      setLoading(false);
    });
  }, []);

  const handleRemove = async (docId: string) => {
    await removeOfflineDocument(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  return (
    <PageContainer width="standard">
      <div className="flex items-center gap-3 mb-6">
        <SecondaryButton
          onClick={() => router.back()}
          icon={ArrowLeft}
          size="sm"
        >
          Back
        </SecondaryButton>
        <div className="flex items-center gap-2">
          <WifiOff className="h-5 w-5 text-muted-foreground" />
          <SectionHeader
            title="Saved for Offline"
            description="Documents available for offline reading"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading saved documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">
            No documents saved for offline reading.
          </p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Use the &quot;Save Offline&quot; button on any document to make it available
            without internet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
            >
              <button
                onClick={() => router.push(`/documents/${doc.id}`)}
                className="flex-1 text-left"
              >
                <h3 className="font-medium text-sm line-clamp-1">
                  {doc.title || "Untitled Document"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Saved {new Date(doc.savedAt).toLocaleDateString()}
                  {doc.documentType && ` · ${doc.documentType}`}
                </p>
              </button>
              <button
                onClick={() => handleRemove(doc.id)}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove from offline"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
