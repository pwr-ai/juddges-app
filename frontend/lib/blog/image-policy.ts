const ALLOWED_REMOTE_IMAGE_ORIGINS = new Set(["https://images.unsplash.com"]);

const INVALID_SOURCE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

/**
 * Keep public blog images inside the hosts accepted by next/image. Stored
 * values are untrusted legacy data, so an invalid value becomes a visual
 * fallback instead of an exception during article rendering.
 */
export function normalizeBlogImageSource(
  value: string | null | undefined,
): string | null {
  const source = value?.trim();
  if (!source || INVALID_SOURCE_CHARACTERS.test(source)) return null;

  if (source.startsWith("/") && !source.startsWith("//")) {
    try {
      const local = new URL(source, "https://local.invalid");
      if (local.hash) return null;
      decodeURI(local.pathname);
      return `${local.pathname}${local.search}`;
    } catch {
      return null;
    }
  }

  try {
    const remote = new URL(source);
    if (
      !ALLOWED_REMOTE_IMAGE_ORIGINS.has(remote.origin) ||
      remote.username ||
      remote.password ||
      remote.hash
    ) {
      return null;
    }
    return remote.href;
  } catch {
    return null;
  }
}
