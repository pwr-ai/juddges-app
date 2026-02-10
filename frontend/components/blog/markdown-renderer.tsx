"use client";

import ReactMarkdown from "react-markdown";
import { Components } from "react-markdown";
import { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

// Register languages
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("sql", sql);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Code block component with syntax highlighting
function CodeBlock({ language, children }: { language: string; children: string }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && language) {
      try {
        hljs.highlightElement(codeRef.current);
      } catch (error) {
        console.error("Error highlighting code:", error);
      }
    }
  }, [language, children]);

  return (
    <div className="my-6 relative group">
      {language && (
        <div className="absolute top-0 right-0 px-3 py-1 text-xs font-mono text-gray-400 bg-gray-800/50 rounded-bl-lg border-l border-b border-gray-700 z-10">
          {language}
        </div>
      )}
      <pre className="!bg-[#0d1117] !p-0 rounded-lg overflow-hidden border border-gray-800 shadow-lg">
        <code
          ref={codeRef}
          className={cn(
            "hljs block overflow-x-auto p-6 text-sm leading-relaxed",
            language && `language-${language}`
          )}
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          }}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const components: Components = {
    // Headings
    h1: ({ children }) => (
      <h1 className="scroll-m-20 text-4xl font-bold tracking-tight mb-6 mt-8 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="scroll-m-20 text-3xl font-semibold tracking-tight mt-10 mb-4 first:mt-0 border-b pb-2">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-3 first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="scroll-m-20 text-xl font-semibold tracking-tight mt-6 mb-2">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="scroll-m-20 text-lg font-semibold tracking-tight mt-4 mb-2">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="scroll-m-20 text-base font-semibold tracking-tight mt-4 mb-2">
        {children}
      </h6>
    ),

    // Paragraph
    p: ({ children }) => (
      <p className="leading-7 mb-4 text-foreground/90">
        {children}
      </p>
    ),

    // Links
    a: ({ href, children }) => {
      const isExternal = href?.startsWith("http");
      const isAnchor = href?.startsWith("#");

      if (isAnchor) {
        return (
          <a
            href={href}
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors font-medium"
          >
            {children}
          </a>
        );
      }

      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors font-medium inline-flex items-center gap-1"
          >
            {children}
            <svg
              className="size-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        );
      }

      return (
        <Link
          href={href || "#"}
          className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors font-medium"
        >
          {children}
        </Link>
      );
    },

    // Lists
    ul: ({ children }) => (
      <ul className="my-6 ml-6 list-disc space-y-2 marker:text-primary">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-6 ml-6 list-decimal space-y-2 marker:text-primary marker:font-semibold">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-7 text-foreground/90">
        {children}
      </li>
    ),

    // Code blocks
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      const isInline = !match;

      if (isInline) {
        return (
          <code
            className="relative rounded bg-muted px-[0.4rem] py-[0.2rem] font-mono text-sm font-semibold text-foreground border border-border"
            {...props}
          >
            {children}
          </code>
        );
      }

      return <CodeBlock language={language}>{String(children).replace(/\n$/, "")}</CodeBlock>;
    },

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-4 border-primary pl-6 italic text-muted-foreground bg-muted/30 py-4 rounded-r-lg">
        {children}
      </blockquote>
    ),

    // Horizontal rule
    hr: () => <hr className="my-8 border-border" />,

    // Images
    img: ({ src, alt }) => {
      if (!src || typeof src !== 'string') return null;

      // Check if it's an external image or placeholder
      const isExternal = src.startsWith("http") || src.startsWith("/api/placeholder");

      return (
        <span className="block my-8 rounded-lg overflow-hidden border border-border shadow-sm">
          {isExternal || src.startsWith("/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt || ""}
              className="w-full h-auto object-cover"
            />
          ) : (
            <Image
              src={src}
              alt={alt || ""}
              width={1200}
              height={600}
              className="w-full h-auto object-cover"
            />
          )}
          {alt && (
            <span className="block text-center text-sm text-muted-foreground italic mt-2 px-4 pb-3">
              {alt}
            </span>
          )}
        </span>
      );
    },

    // Tables
    table: ({ children }) => (
      <div className="my-6 w-full overflow-x-auto">
        <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-border">
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr className="border-b border-border transition-colors hover:bg-muted/50">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-3 text-left font-semibold text-sm">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-sm">
        {children}
      </td>
    ),

    // Strong and emphasis
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em className="italic">
        {children}
      </em>
    ),

    // Deleted text
    del: ({ children }) => (
      <del className="line-through text-muted-foreground">
        {children}
      </del>
    ),

    // Pre (for code blocks container)
    pre: ({ children }) => (
      <div className="overflow-hidden rounded-lg">
        {children}
      </div>
    ),
  };

  return (
    <div
      className={cn(
        "prose prose-lg max-w-none prose-headings:scroll-m-20",
        className
      )}
    >
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
