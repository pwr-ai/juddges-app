import { ImageResponse } from "next/og";
import { getBrandConfig } from "@/lib/brand";

// Editorial Jurisprudence palette (see docs/reference/DESIGN.md).
const PARCHMENT = "#F5F1E8";
const INK = "#1A1A2E";
const INK_SOFT = "#5A5A75";
const OXBLOOD = "#8B1E3F";
const GOLD = "#B8954A";
const RULE = "#C9C2B0";

export const alt =
  "Juddges — Judicial Decision Data Gathering, Encoding, and Sharing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
  const brand = getBrandConfig();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PARCHMENT,
          padding: "72px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: INK_SOFT,
            fontFamily: "monospace",
          }}
        >
          <span style={{ color: OXBLOOD }}>§</span>
          <span>Legal-AI Research Platform</span>
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 132,
              lineHeight: 1,
              color: INK,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            {brand.name}
          </div>
          <div
            style={{
              width: 160,
              height: 6,
              backgroundColor: GOLD,
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 40,
              lineHeight: 1.25,
              color: INK_SOFT,
              fontStyle: "italic",
              maxWidth: 920,
            }}
          >
            {brand.tagline}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${RULE}`,
            paddingTop: 28,
            fontSize: 24,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: INK,
            fontFamily: "monospace",
          }}
        >
          <span>Polish & UK Court Judgments</span>
          <span style={{ color: OXBLOOD }}>Semantic Search · Extraction · Analytics</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
