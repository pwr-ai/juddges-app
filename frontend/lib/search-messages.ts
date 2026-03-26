// lib/search-messages.ts

export type MessageCategory = 'process' | 'tip' | 'entertaining';

export interface SearchMessage {
  text: string;
  duration: number;
  category: MessageCategory;
}

export const SEARCH_MESSAGES: SearchMessage[] = [
  // Process messages (60% of rotation)
  {
    text: "Analyzing your search query...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Scanning through legal documents...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Checking relevant case law...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Cross-referencing citations...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Reviewing statutes and regulations...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Evaluating document relevance...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Ranking results by importance...",
    duration: 2500,
    category: 'process',
  },
  {
    text: "Extracting key passages...",
    duration: 2500,
    category: 'process',
  },

  // Educational tips (25% of rotation)
  {
    text: "Pro tip: Use quotation marks for exact phrase matching",
    duration: 3000,
    category: 'tip',
  },
  {
    text: "Did you know? You can filter by document type after searching",
    duration: 3000,
    category: 'tip',
  },
  {
    text: "Tip: Boolean operators AND, OR, NOT refine your results",
    duration: 3000,
    category: 'tip',
  },
  {
    text: "Try using date ranges to narrow your search",
    duration: 3000,
    category: 'tip',
  },

  // Entertaining messages (15% of rotation)
  {
    text: "Finding the needle in the legal haystack...",
    duration: 2500,
    category: 'entertaining',
  },
  {
    text: "Summoning the relevant precedents...",
    duration: 2500,
    category: 'entertaining',
  },
  {
    text: "Consulting our digital law library...",
    duration: 2500,
    category: 'entertaining',
  },
];

// Extended messages for longer searches (>10 seconds)
export const EXTENDED_MESSAGES: SearchMessage[] = [
  {
    text: "Thorough searches take time... we're being meticulous",
    duration: 3000,
    category: 'process',
  },
  {
    text: "Quality over speed - ensuring accurate results",
    duration: 3000,
    category: 'process',
  },
  {
    text: "Still searching... your query is quite comprehensive",
    duration: 3000,
    category: 'process',
  },
];
