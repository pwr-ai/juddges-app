import * as React from "react";
import { EmptyState } from "@juddges/design-system";

const SearchIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);
const FolderIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);
const ChatIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

export const NoResults = () => (
  <EmptyState
    icon={SearchIcon}
    title="No judgments match"
    description='Nothing in the corpus matches “zasiedzenie służebności przesyłu 2019 SA Gdańsk”. Try fewer terms, or widen the date range.'
    action={{ label: "Clear filters", onClick: () => {} }}
  />
);

export const NoCollections = () => (
  <EmptyState
    icon={FolderIcon}
    title="No collections yet"
    description="Group judgments by matter, client or research question. Collections can be shared with your chambers."
    action={{ label: "Create a collection", onClick: () => {} }}
  />
);

export const WithoutAction = () => (
  <EmptyState
    icon={ChatIcon}
    title="No conversations"
    description="Ask a question about the case law and your conversation history will appear here."
  />
);
