import { isCanonicalUuid } from '@/lib/validation/canonical-uuid';

export interface PublicRouteRequest {
  pathname: string;
  method: string;
  searchParams?: Pick<URLSearchParams, 'get' | 'getAll'>;
}

const PUBLIC_READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

const EXACT_PUBLIC_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/about',
  '/ecosystem',
  '/onboarding',
  '/status',
  '/offline',
  '/accessibility',
  '/contact',
  '/cookies',
  '/privacy',
  '/team',
  '/terms',
  '/opengraph-image',
  '/twitter-image',
]);

const PUBLIC_PAGE_SUBTREES = [
  '/auth',
  '/legal',
  '/blog',
  '/publications',
  '/use-cases',
] as const;

const PROTECTED_PAGE_SUBTREES = [
  '/blog/admin',
  '/publications/admin',
] as const;

const EXACT_PUBLIC_READ_APIS: ReadonlySet<string> = new Set([
  '/api/dashboard/stats',
  '/api/contact',
  '/api/blog/categories',
]);

const PUBLIC_READ_API_SUBTREES = [
  '/api/health',
  '/api/blog/posts',
  '/api/publications',
] as const;

const CHAT_MESSAGES_PREFIX = '/api/chats/';
const CHAT_MESSAGES_SUFFIX = '/messages';
const DOCUMENT_METADATA_API_PATTERN =
  /^\/api\/documents\/[a-zA-Z0-9_.-]{1,255}\/metadata$/;

function matchesSegmentTree(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function matchesAnySegmentTree(
  pathname: string,
  roots: readonly string[],
): boolean {
  return roots.some((root) => matchesSegmentTree(pathname, root));
}

function matchesExactPage(pathname: string): boolean {
  if (EXACT_PUBLIC_PAGES.has(pathname)) return true;
  if (!pathname.endsWith('/') || pathname === '/') return false;
  return EXACT_PUBLIC_PAGES.has(pathname.slice(0, -1));
}

function isPublicPage(pathname: string): boolean {
  if (matchesAnySegmentTree(pathname, PROTECTED_PAGE_SUBTREES)) return false;
  return (
    matchesExactPage(pathname) ||
    matchesAnySegmentTree(pathname, PUBLIC_PAGE_SUBTREES)
  );
}

export function isAnonymousExtractionBffRead({
  pathname,
  method,
  searchParams,
}: PublicRouteRequest): boolean {
  if (!PUBLIC_READ_METHODS.has(method)) return false;
  if (pathname !== '/api/extractions' || !searchParams) return false;
  const jobIds = searchParams.getAll('job_id');
  return jobIds.length === 1 && isCanonicalUuid(jobIds[0]);
}

export function isAnonymousDocumentBffRead({
  pathname,
  method,
}: PublicRouteRequest): boolean {
  return (
    PUBLIC_READ_METHODS.has(method) &&
    DOCUMENT_METADATA_API_PATTERN.test(pathname)
  );
}

function isPublicReadApi(
  pathname: string,
  method: string,
  searchParams: PublicRouteRequest['searchParams'],
): boolean {
  return (
    EXACT_PUBLIC_READ_APIS.has(pathname) ||
    matchesAnySegmentTree(pathname, PUBLIC_READ_API_SUBTREES) ||
    isPublicChatMessagesRead(pathname) ||
    isAnonymousDocumentBffRead({ pathname, method }) ||
    isAnonymousExtractionBffRead({ pathname, method, searchParams })
  );
}

function isPublicChatMessagesRead(pathname: string): boolean {
  if (
    !pathname.startsWith(CHAT_MESSAGES_PREFIX) ||
    !pathname.endsWith(CHAT_MESSAGES_SUFFIX)
  ) {
    return false;
  }

  const chatId = pathname.slice(
    CHAT_MESSAGES_PREFIX.length,
    -CHAT_MESSAGES_SUFFIX.length,
  );
  return isCanonicalUuid(chatId);
}

export function isPublicRequest({
  pathname,
  method,
  searchParams,
}: PublicRouteRequest): boolean {
  if (pathname === '/api/graphql') return true;
  if (pathname === '/api/contact' && method === 'POST') return true;
  if (!PUBLIC_READ_METHODS.has(method)) return false;
  return isPublicPage(pathname) || isPublicReadApi(pathname, method, searchParams);
}
