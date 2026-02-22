/**
 * Guest Mode Management
 * Allows unauthenticated users to perform limited searches
 */

const GUEST_STORAGE_KEY = 'juddges-guest-session';
const MAX_GUEST_SEARCHES = 5;

export interface GuestSession {
  searchCount: number;
  firstVisit: string;
  lastSearch: string | null;
}

export function getGuestSession(): GuestSession {
  if (typeof window === 'undefined') {
    return { searchCount: 0, firstVisit: new Date().toISOString(), lastSearch: null };
  }

  const stored = localStorage.getItem(GUEST_STORAGE_KEY);
  if (!stored) {
    const newSession: GuestSession = {
      searchCount: 0,
      firstVisit: new Date().toISOString(),
      lastSearch: null,
    };
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newSession));
    return newSession;
  }

  return JSON.parse(stored);
}

export function incrementGuestSearchCount(): GuestSession {
  const session = getGuestSession();
  session.searchCount += 1;
  session.lastSearch = new Date().toISOString();
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function getRemainingGuestSearches(): number {
  const session = getGuestSession();
  return Math.max(0, MAX_GUEST_SEARCHES - session.searchCount);
}

export function hasGuestSearchesRemaining(): boolean {
  return getRemainingGuestSearches() > 0;
}

export function resetGuestSession(): void {
  localStorage.removeItem(GUEST_STORAGE_KEY);
}

export function shouldShowUpgradePrompt(): boolean {
  const session = getGuestSession();
  // Show after 3 searches
  return session.searchCount >= 3 && session.searchCount < MAX_GUEST_SEARCHES;
}

export function isGuestLimitReached(): boolean {
  const session = getGuestSession();
  return session.searchCount >= MAX_GUEST_SEARCHES;
}

export const GUEST_MODE_CONSTANTS = {
  MAX_SEARCHES: MAX_GUEST_SEARCHES,
  UPGRADE_PROMPT_THRESHOLD: 3,
};
