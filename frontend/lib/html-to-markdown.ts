/**
 * Utility functions for HTML to Markdown conversion
 */

/**
 * Checks if a string contains HTML tags
 */
export const containsHtml = (text: string): boolean => {
  const htmlRegex = /<[^>]*>/g;
  return htmlRegex.test(text);
};

/**
 * Converts HTML content to markdown
 */
export const htmlToMarkdown = (html: string): string => {
  if (!html || !containsHtml(html)) {
    return html;
  }

  let markdown = html;

  // Convert common HTML tags to markdown
  markdown = markdown
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')

    // Bold and italic
    .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '_$2_')

    // Paragraphs - handle styled paragraphs
    .replace(/<p[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>(.*?)<\/p>/gi, '\n\n**$1**\n\n')
    .replace(/<p[^>]*style="[^"]*font-weight:\s*bold[^"]*"[^>]*>(.*?)<\/p>/gi, '\n\n**$1**\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')

    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')

    // Lists
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')

    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')

    // Remove remaining HTML tags
    .replace(/<[^>]*>/g, '')

    // Clean up extra whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')

    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return markdown;
};
