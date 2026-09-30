/**
 * Highlighted Text Component
 * Displays text with highlighted chunks from search results
 * Used in document dialogs to show relevant excerpts
 */

"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { containsHtml, htmlToMarkdown } from "@/lib/html-to-markdown";
import type { SearchChunk } from "@/types/search";

export interface HighlightedTextProps {
 text: string;
 chunks: SearchChunk[];
}

// ReactMarkdown trims the leading and trailing whitespace off a paragraph. The
// highlighted chunk next to it is emitted as a raw string, so without this the
// two fuse: "the appellant had" + "no standing" (#722). Interior whitespace
// survives parsing, so only the segment edges need peeling off and re-emitting
// as literal text either side of the parsed middle.
const INLINE_COMPONENTS = {
 p: ({ children }: { children?: React.ReactNode }) => <span className="leading-relaxed">{children}</span>,
 strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold">{children}</strong>,
 em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
};

const renderSegment = (segment: string, key: string): React.ReactElement => {
 const [, leading, middle, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(segment) as RegExpExecArray;

 return (
 <React.Fragment key={key}>
 {leading}
 {middle && (
 <span className="prose max-w-none inline">
 <ReactMarkdown components={INLINE_COMPONENTS}>{middle}</ReactMarkdown>
 </span>
 )}
 {trailing}
 </React.Fragment>
 );
};

export const HighlightedText = ({ text, chunks }: HighlightedTextProps): React.JSX.Element | null => {
 if (!text) return null;

 // Convert HTML to markdown if needed
 const processedText = containsHtml(text) ? htmlToMarkdown(text) : text;

 if (chunks.length === 0) {
 return (
 <div className="prose max-w-none">
 <ReactMarkdown
 components={{
 p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
 h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 text-center">{children}</h1>,
 h2: ({ children }) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
 h3: ({ children }) => <h3 className="text-lg font-semibold mb-2">{children}</h3>,
 strong: ({ children }) => <strong className="font-bold">{children}</strong>,
 em: ({ children }) => <em className="italic">{children}</em>,
 }}
 >
 {processedText}
 </ReactMarkdown>
 </div>
 );
 }

 const validChunks = chunks.filter((c): c is SearchChunk & { chunk_text: string } => !!c.chunk_text);
 const sortedChunks = [...validChunks].sort((a, b) => processedText.indexOf(a.chunk_text) - processedText.indexOf(b.chunk_text));
 let lastIndex = 0;
 const elements: React.ReactElement[] = [];

 for (const chunk of sortedChunks) {
 const index = processedText.indexOf(chunk.chunk_text, lastIndex);
 if (index === -1) continue;

 if (index > lastIndex) {
 elements.push(renderSegment(processedText.substring(lastIndex, index), `text-${lastIndex}`));
 }
 elements.push(
 <span key={`highlight-${index}`} className="bg-gold-soft font-medium">
 {chunk.chunk_text}
 </span>
 );
 lastIndex = index + chunk.chunk_text.length;
 }

 if (lastIndex < processedText.length) {
 elements.push(renderSegment(processedText.substring(lastIndex), 'text-end'));
 }

 return <>{elements}</>;
};
