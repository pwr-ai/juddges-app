import React from "react";

interface JsonLdProps {
  /** A schema.org object, or an array of them. */
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Renders JSON-LD structured data.
 *
 * `<` is escaped to `<` so the serialized JSON can never break out of the
 * surrounding `<script>` element (XSS-safe).
 */
export function JsonLd({ data }: JsonLdProps): React.JSX.Element {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
