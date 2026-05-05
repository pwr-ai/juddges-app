import {
  SEARCH_MESSAGES,
  EXTENDED_MESSAGES,
  type SearchMessage,
  type MessageCategory,
} from '@/lib/search-messages';

const VALID_CATEGORIES: MessageCategory[] = ['process', 'tip', 'entertaining'];

function assertValidMessage(msg: SearchMessage): void {
  expect(typeof msg.text).toBe('string');
  expect(msg.text.length).toBeGreaterThan(0);
  expect(typeof msg.duration).toBe('number');
  expect(msg.duration).toBeGreaterThan(0);
  expect(VALID_CATEGORIES).toContain(msg.category);
}

describe('SEARCH_MESSAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SEARCH_MESSAGES)).toBe(true);
    expect(SEARCH_MESSAGES.length).toBeGreaterThan(0);
  });

  it('contains entries with text, duration, and a valid category', () => {
    SEARCH_MESSAGES.forEach(assertValidMessage);
  });

  it('contains messages from all three categories', () => {
    const categories = new Set(SEARCH_MESSAGES.map(m => m.category));
    expect(categories.has('process')).toBe(true);
    expect(categories.has('tip')).toBe(true);
    expect(categories.has('entertaining')).toBe(true);
  });

  it('has unique message text per entry', () => {
    const texts = SEARCH_MESSAGES.map(m => m.text);
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(texts.length);
  });
});

describe('EXTENDED_MESSAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EXTENDED_MESSAGES)).toBe(true);
    expect(EXTENDED_MESSAGES.length).toBeGreaterThan(0);
  });

  it('contains valid SearchMessage entries', () => {
    EXTENDED_MESSAGES.forEach(assertValidMessage);
  });

  it('uses only the process category for fallback messaging', () => {
    EXTENDED_MESSAGES.forEach(m => {
      expect(m.category).toBe('process');
    });
  });
});
