import * as React from "react";
import { ChartFigure } from "@juddges/design-system";

const years = [
  { y: "2019", uk: 620, pl: 410 },
  { y: "2020", uk: 540, pl: 690 },
  { y: "2021", uk: 710, pl: 880 },
  { y: "2022", uk: 830, pl: 1020 },
  { y: "2023", uk: 910, pl: 1140 },
  { y: "2024", uk: 760, pl: 1210 },
];

const BarChart = () => {
  const max = 1300;
  const w = 600;
  const h = 200;
  const pad = 28;
  const group = (w - pad * 2) / years.length;
  const bar = group * 0.32;
  return (
    <svg viewBox={`0 0 ${w} ${h + 28}`} className="h-auto w-full" role="img" aria-label="Judgments per year">
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - pad}
          y1={h - t * (h - 12)}
          y2={h - t * (h - 12)}
          style={{ stroke: "#C9C2B0", strokeWidth: 1 }}
        />
      ))}
      {years.map((d, i) => {
        const x = pad + i * group + group * 0.18;
        const hu = ((h - 12) * d.uk) / max;
        const hp = ((h - 12) * d.pl) / max;
        return (
          <g key={d.y}>
            <rect x={x} y={h - hu} width={bar} height={hu} style={{ fill: "#1A1A2E" }} />
            <rect x={x + bar + 4} y={h - hp} width={bar} height={hp} style={{ fill: "#8B1E3F" }} />
            <text
              x={x + bar + 2}
              y={h + 18}
              textAnchor="middle"
              style={{ fill: "#5A5A75", fontFamily: "Geist Mono, monospace", fontSize: 11 }}
            >
              {d.y}
            </text>
          </g>
        );
      })}
      <line x1={pad} x2={w - pad} y1={h} y2={h} style={{ stroke: "#1A1A2E", strokeWidth: 1 }} />
    </svg>
  );
};

export const Default = () => (
  <ChartFigure
    figure="01"
    eyebrow="Temporal"
    title="Judgments per year, by jurisdiction"
    caption="Ink bars are the England & Wales Court of Appeal; oxblood bars are Polish common courts. The Polish corpus overtakes the UK series from 2020 onward."
    source="6,050 UK + 6,050 PL judgments"
  >
    <BarChart />
  </ChartFigure>
);

export const Featured = () => (
  <ChartFigure
    figure="02"
    eyebrow="Coverage"
    title={<>Where the <em className="italic text-oxblood">reasoning</em> comes from</>}
    caption="Featured figure carries a short oxblood mark on the top rule."
    source="JuDDGES corpus snapshot, March 2026"
    featured
  >
    <BarChart />
  </ChartFigure>
);

export const TitleOnly = () => (
  <ChartFigure title="Appeals allowed vs dismissed, Sąd Apelacyjny we Wrocławiu">
    <BarChart />
  </ChartFigure>
);

export const Bare = () => (
  <ChartFigure>
    <BarChart />
  </ChartFigure>
);
