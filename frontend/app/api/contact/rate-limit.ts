import { RateLimitError } from "@/lib/errors";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRateLimitConfig(): { maxSubmissions: number; windowMs: number } {
  return {
    maxSubmissions: parsePositiveInt(process.env.CONTACT_RATE_LIMIT_MAX, 5),
    windowMs: parsePositiveInt(
      process.env.CONTACT_RATE_LIMIT_WINDOW_MS,
      60 * 60 * 1000
    ),
  };
}

export function enforceContactRateLimit(ipAddress: string): void {
  const now = Date.now();
  const { maxSubmissions, windowMs } = getRateLimitConfig();

  const existing = rateLimitStore.get(ipAddress);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(ipAddress, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= maxSubmissions) {
    throw new RateLimitError("Too many contact submissions. Please try again later.");
  }

  rateLimitStore.set(ipAddress, {
    count: existing.count + 1,
    resetAt: existing.resetAt,
  });
}

export function resetContactRateLimitStoreForTests(): void {
  rateLimitStore.clear();
}
