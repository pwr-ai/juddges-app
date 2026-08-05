/**
 * RFC 9562/4122 UUIDs accepted by Zod's `uuid()` validator.
 *
 * Keep the unanchored source available for exact route-segment regexes so
 * middleware and application validation cannot drift apart.
 */
export const CANONICAL_UUID_PATH_SEGMENT =
  "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)";

export const CANONICAL_UUID_PATTERN = new RegExp(
  `^${CANONICAL_UUID_PATH_SEGMENT}$`,
  "i",
);

export function isCanonicalUuid(value: string): boolean {
  return CANONICAL_UUID_PATTERN.test(value);
}
