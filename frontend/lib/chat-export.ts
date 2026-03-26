/**
 * Chat export utilities for generating PDF and DOCX documents
 * from chat conversations with AI, including sources and citations.
 */

import { jsPDF } from "jspdf";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Packer,
  SectionType,
  TableOfContents,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from "docx";

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = "pdf" | "docx";

export interface ChatExportData {
  chat: {
    id: string;
    title: string | null;
    created_at: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    document_ids?: string[];
    created_at?: string;
  }>;
  sources: Record<
    string,
    {
      title: string | null;
      document_type: string | null;
      document_number: string | null;
      date_issued: string | null;
      summary: string | null;
      court_name: string | null;
    }
  >;
}

// ============================================================================
// Helpers
// ============================================================================

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function sanitizeFilename(title: string | null): string {
  const base = title || "Chat Export";
  return base
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 60);
}

/** Collect unique source IDs across all messages in order */
function collectSourceIds(data: ChatExportData): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const msg of data.messages) {
    if (msg.document_ids) {
      for (const id of msg.document_ids) {
        const cleanId = id.replace(/^\/doc\//, "");
        if (!seen.has(cleanId)) {
          seen.add(cleanId);
          ordered.push(cleanId);
        }
      }
    }
  }
  return ordered;
}

/** Strip markdown formatting for plain text output */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "") // headers
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/```[\s\S]*?```/g, (match) => {
      // code blocks: extract content
      return match.replace(/```\w*\n?/g, "").trim();
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*+]\s+/gm, "  - ") // list items
    .replace(/^\d+\.\s+/gm, (match) => `  ${match}`) // numbered list items
    .replace(/^>\s+/gm, "  ") // blockquotes
    .replace(/---+/g, ""); // horizontal rules
}

// ============================================================================
// PDF Export
// ============================================================================

export function exportChatToPDF(
  data: ChatExportData,
  includeSources: boolean = true
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number): void => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // --- Title Page ---
  const title = data.chat.title || "Chat Conversation";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, pageWidth / 2, y + 20, { align: "center" });
  y += 20 + titleLines.length * 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Exported: ${formatDate(new Date().toISOString())}`,
    pageWidth / 2,
    y + 5,
    { align: "center" }
  );
  y += 10;
  doc.text(
    `Created: ${formatDate(data.chat.created_at)}`,
    pageWidth / 2,
    y + 5,
    { align: "center" }
  );
  y += 10;
  doc.text(
    `Messages: ${data.messages.length}`,
    pageWidth / 2,
    y + 5,
    { align: "center" }
  );
  y += 5;

  const sourceIds = collectSourceIds(data);
  if (includeSources && sourceIds.length > 0) {
    doc.text(
      `Sources cited: ${sourceIds.length}`,
      pageWidth / 2,
      y + 5,
      { align: "center" }
    );
    y += 5;
  }

  doc.setTextColor(0, 0, 0);

  // Separator
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // --- Conversation ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Conversation", margin, y);
  y += 10;

  for (const msg of data.messages) {
    const isUser = msg.role === "user";
    const label = isUser ? "User" : "AI Assistant";
    const cleanContent = stripMarkdown(msg.content);

    // Role header
    checkPageBreak(15);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isUser ? 37 : 22, isUser ? 99 : 119, isUser ? 235 : 73);
    doc.text(label, margin, y);

    if (msg.created_at) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(formatDate(msg.created_at), pageWidth - margin, y, {
        align: "right",
      });
    }
    y += 5;

    // Content
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(cleanContent, contentWidth);

    for (const line of lines) {
      checkPageBreak(5);
      doc.text(line, margin, y);
      y += 4.5;
    }

    // Source references for this message
    if (
      includeSources &&
      msg.document_ids &&
      msg.document_ids.length > 0
    ) {
      checkPageBreak(6);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const refs = msg.document_ids.map((id) => {
        const cleanId = id.replace(/^\/doc\//, "");
        const src = data.sources[cleanId];
        return src?.document_number || src?.title || cleanId;
      });
      const refText = `Sources: ${refs.join(", ")}`;
      const refLines = doc.splitTextToSize(refText, contentWidth);
      for (const refLine of refLines) {
        checkPageBreak(4);
        doc.text(refLine, margin, y);
        y += 3.5;
      }
      doc.setTextColor(0, 0, 0);
    }

    // Spacing between messages
    y += 6;
    checkPageBreak(2);
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  // --- Sources Section ---
  if (includeSources && sourceIds.length > 0) {
    doc.addPage();
    y = margin;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Sources and Citations", margin, y);
    y += 10;

    for (let i = 0; i < sourceIds.length; i++) {
      const id = sourceIds[i];
      const src = data.sources[id];

      checkPageBreak(25);

      // Source number and title
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      const sourceTitle = src?.title || id;
      const sourceLine = `[${i + 1}] ${sourceTitle}`;
      const titleLines = doc.splitTextToSize(sourceLine, contentWidth);
      for (const tl of titleLines) {
        checkPageBreak(5);
        doc.text(tl, margin, y);
        y += 4.5;
      }

      // Metadata
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);

      const meta: string[] = [];
      if (src?.document_type) meta.push(`Type: ${src.document_type}`);
      if (src?.document_number) meta.push(`No: ${src.document_number}`);
      if (src?.date_issued)
        meta.push(`Date: ${formatShortDate(src.date_issued)}`);
      if (src?.court_name) meta.push(`Court: ${src.court_name}`);

      if (meta.length > 0) {
        checkPageBreak(5);
        doc.text(meta.join("  |  "), margin + 2, y);
        y += 4;
      }

      // Summary
      if (src?.summary) {
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const summaryLines = doc.splitTextToSize(
          src.summary.substring(0, 500),
          contentWidth - 4
        );
        for (const sl of summaryLines) {
          checkPageBreak(4);
          doc.text(sl, margin + 2, y);
          y += 3.5;
        }
      }

      y += 5;
    }
  }

  // --- Footer on each page ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`AI Tax - ${title}`, margin, pageHeight - 10);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, {
      align: "right",
    });
  }

  const filename = sanitizeFilename(data.chat.title);
  const blob = doc.output("blob");
  downloadBlob(blob, `${filename}.pdf`);
}

// ============================================================================
// DOCX Export
// ============================================================================

export async function exportChatToDocx(
  data: ChatExportData,
  includeSources: boolean = true
): Promise<void> {
  const title = data.chat.title || "Chat Conversation";
  const sourceIds = collectSourceIds(data);

  // Build document children
  const children: Paragraph[] = [];

  // --- Title ---
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Metadata
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `Exported: ${formatDate(new Date().toISOString())}`,
          color: "888888",
          size: 20,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `Created: ${formatDate(data.chat.created_at)}`,
          color: "888888",
          size: 20,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `Messages: ${data.messages.length}`,
          color: "888888",
          size: 20,
        }),
      ],
    })
  );

  if (includeSources && sourceIds.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: `Sources cited: ${sourceIds.length}`,
            color: "888888",
            size: 20,
          }),
        ],
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      },
      spacing: { after: 300 },
    })
  );

  // --- Conversation Heading ---
  children.push(
    new Paragraph({
      text: "Conversation",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  // --- Messages ---
  for (const msg of data.messages) {
    const isUser = msg.role === "user";
    const label = isUser ? "User" : "AI Assistant";

    // Role + timestamp line
    const headerRuns: TextRun[] = [
      new TextRun({
        text: label,
        bold: true,
        color: isUser ? "2563EB" : "167749",
        size: 22,
      }),
    ];

    if (msg.created_at) {
      headerRuns.push(
        new TextRun({
          text: `    ${formatDate(msg.created_at)}`,
          color: "999999",
          size: 16,
        })
      );
    }

    children.push(
      new Paragraph({
        children: headerRuns,
        spacing: { before: 200, after: 80 },
      })
    );

    // Content - split by line breaks for proper formatting
    const contentLines = msg.content.split("\n");
    for (const line of contentLines) {
      const stripped = stripMarkdown(line);
      if (stripped.trim() === "") {
        children.push(new Paragraph({ spacing: { after: 40 } }));
        continue;
      }

      // Detect bold segments from markdown **text**
      const runs: TextRun[] = [];
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(
            new TextRun({
              text: part.slice(2, -2),
              bold: true,
              size: 20,
            })
          );
        } else {
          runs.push(
            new TextRun({
              text: stripMarkdown(part),
              size: 20,
            })
          );
        }
      }

      children.push(
        new Paragraph({
          children: runs,
          spacing: { after: 40 },
        })
      );
    }

    // Source references for this message
    if (
      includeSources &&
      msg.document_ids &&
      msg.document_ids.length > 0
    ) {
      const refs = msg.document_ids.map((id) => {
        const cleanId = id.replace(/^\/doc\//, "");
        const src = data.sources[cleanId];
        return src?.document_number || src?.title || cleanId;
      });

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Sources: ${refs.join(", ")}`,
              color: "888888",
              size: 16,
              italics: true,
            }),
          ],
          spacing: { before: 40, after: 80 },
        })
      );
    }

    // Separator between messages
    children.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
        },
        spacing: { after: 100 },
      })
    );
  }

  // --- Sources Section ---
  if (includeSources && sourceIds.length > 0) {
    children.push(
      new Paragraph({
        text: "Sources and Citations",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        pageBreakBefore: true,
      })
    );

    for (let i = 0; i < sourceIds.length; i++) {
      const id = sourceIds[i];
      const src = data.sources[id];

      // Source title
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${i + 1}] `,
              bold: true,
              size: 22,
            }),
            new TextRun({
              text: src?.title || id,
              bold: true,
              size: 22,
            }),
          ],
          spacing: { before: 200, after: 60 },
        })
      );

      // Metadata line
      const meta: string[] = [];
      if (src?.document_type) meta.push(`Type: ${src.document_type}`);
      if (src?.document_number) meta.push(`No: ${src.document_number}`);
      if (src?.date_issued)
        meta.push(`Date: ${formatShortDate(src.date_issued)}`);
      if (src?.court_name) meta.push(`Court: ${src.court_name}`);

      if (meta.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: meta.join("  |  "),
                color: "666666",
                size: 18,
              }),
            ],
            spacing: { after: 60 },
          })
        );
      }

      // Summary
      if (src?.summary) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: src.summary.substring(0, 1000),
                color: "444444",
                size: 18,
                italics: true,
              }),
            ],
            spacing: { after: 100 },
          })
        );
      }
    }
  }

  // Build DOCX document
  const docxDocument = new Document({
    creator: "AI Tax",
    title: title,
    description: `Chat conversation export - ${title}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "AI Tax - Chat Export",
                    color: "AAAAAA",
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: "AAAAAA",
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(docxDocument);
  const filename = sanitizeFilename(data.chat.title);
  downloadBlob(
    buffer,
    `${filename}.docx`
  );
}

// ============================================================================
// Main export function
// ============================================================================

export async function exportChat(
  data: ChatExportData,
  format: ExportFormat,
  includeSources: boolean = true
): Promise<void> {
  if (format === "pdf") {
    exportChatToPDF(data, includeSources);
  } else {
    await exportChatToDocx(data, includeSources);
  }
}
