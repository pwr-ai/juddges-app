import { notFound, redirect } from 'next/navigation';

import {
  DocumentMetadataNotFoundError,
  fetchDocumentMetadata,
  isValidDocumentId,
} from '@/lib/documents/server-metadata';
import { createClient } from '@/lib/supabase/server';

import { DocumentPageClient } from './_components/DocumentPageClient';

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function DocumentPage({
  params,
}: DocumentPageProps): Promise<React.JSX.Element> {
  const { id: documentId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/documents/${documentId}`)}`);
  }

  if (!isValidDocumentId(documentId)) {
    notFound();
  }

  try {
    const initialMetadata = await fetchDocumentMetadata(documentId, data.user.id);
    return (
      <DocumentPageClient
        documentId={documentId}
        initialMetadata={initialMetadata}
      />
    );
  } catch (error) {
    if (error instanceof DocumentMetadataNotFoundError) {
      notFound();
    }
    throw error;
  }
}
