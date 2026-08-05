import type { DocumentMetadata } from '@/app/documents/[id]/_components/types';

export const DOCUMENT_METADATA_HEADER = 'x-juddges-document-metadata';
export const VERIFIED_USER_HEADER = 'x-juddges-verified-user-id';

export function isDocumentMetadata(value: unknown): value is DocumentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.document_id === 'string' &&
    typeof metadata.document_type === 'string' &&
    typeof metadata.language === 'string'
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encodeDocumentMetadataHeader(
  metadata: DocumentMetadata
): Promise<string> {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(metadata)));
}

export async function decodeDocumentMetadataHeader(
  value: string
): Promise<DocumentMetadata> {
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(value))
    );
    if (!isDocumentMetadata(payload)) throw new Error('Invalid metadata payload');
    return payload;
  } catch {
    throw new Error('Invalid verified document metadata');
  }
}
