'use client';

import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  ChartFigure,
  Headline,
  Masthead,
  PaperBackground,
  SectionHeader,
} from '@/components/editorial';
import {
  editorialCategorical,
  editorialPlotConfig,
  editorialPlotLayout,
  editorialSeries,
} from '@/lib/charts/editorial-plot';
import stats from '@/lib/stats/dataset-comparison-stats.json';

const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

const UK = editorialSeries.uk;
const PL = editorialSeries.pl;
const UK_SOFT = editorialSeries.ukSoft;
const PL_SOFT = editorialSeries.plSoft;

function StatCard({ label, ukValue, plValue, format }: {
  label: string;
  ukValue: string | number;
  plValue: string | number;
  format?: string;
}) {
  const fmt = (v: string | number) =>
    typeof v === 'number' ? v.toLocaleString() : v;
  return (
    <div className="editorial-card flex flex-col p-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
        {label}
      </p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">UK</span>
          <span className="editorial-numeral text-2xl text-[color:var(--ink)] leading-none">
            {fmt(ukValue)}{format}
          </span>
        </div>
        <span aria-hidden className="self-stretch w-px bg-[color:var(--rule)]" />
        <div className="flex flex-col items-end text-right">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--oxblood)]">PL</span>
          <span className="editorial-numeral text-2xl text-[color:var(--oxblood)] leading-none">
            {fmt(plValue)}{format}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Ranked editorial list — replaces a horizontal-bar Plot for top-N rankings.
 * Renders each entry as: rank · italic serif name with hairline progress rule
 * · tabular numeral. Designed for the "Most Active Judges" figures.
 */
function RankedList({ items, color }: {
  items: { name: string; count: number }[];
  color: string;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <ol className="flex flex-col gap-3.5">
      {items.map((item, i) => {
        const pct = Math.max(2, (item.count / max) * 100);
        return (
          <li
            key={`${i}-${item.name}`}
            className="grid grid-cols-[2.25rem_1fr_3.25rem] items-baseline gap-3"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)] tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-serif text-[15px] italic leading-snug text-[color:var(--ink)]">
                {item.name}
              </span>
              <span aria-hidden className="mt-1 block h-px bg-[color:var(--rule)]">
                <span
                  className="block h-px"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </span>
            </span>
            <span className="editorial-numeral text-right text-[15px] text-[color:var(--ink)] tabular-nums">
              {item.count}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ numeral, eyebrow, title, description, children }: {
  numeral?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16 relative">
      <SectionHeader
        numeral={numeral}
        eyebrow={eyebrow}
        title={title}
        className={description ? 'mb-3' : 'mb-6'}
      />
      {description && (
        <p className="relative z-10 mb-7 max-w-3xl text-[17px] leading-[1.65] text-[color:var(--ink)]">
          {description}
        </p>
      )}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export default function DatasetComparisonPage() {
  // Year distribution (aligned across both corpora)
  const allYears = Array.from(new Set([
    ...Object.keys(stats.uk.year_distribution),
    ...Object.keys(stats.pl.year_distribution),
  ])).sort();
  const ukYearCounts = allYears.map(y => (stats.uk.year_distribution as Record<string, number>)[y] || 0);
  const plYearCounts = allYears.map(y => (stats.pl.year_distribution as Record<string, number>)[y] || 0);

  // Length distribution
  const lengthBuckets = ['<5K', '5-10K', '10-20K', '20-30K', '30-50K', '50-100K', '>100K'];
  const ukLengths = lengthBuckets.map(b => (stats.uk.length_distribution as Record<string, number>)[b] || 0);
  const plLengths = lengthBuckets.map(b => (stats.pl.length_distribution as Record<string, number>)[b] || 0);

  // Word distribution
  const wordBuckets = ['<1K', '1-2K', '2-3K', '3-5K', '5-10K', '>10K'];
  const ukWords = wordBuckets.map(b => (stats.uk.word_distribution as Record<string, number>)[b] || 0);
  const plWords = wordBuckets.map(b => (stats.pl.word_distribution as Record<string, number>)[b] || 0);

  // Panel size distribution
  const allPanelSizes = Array.from(new Set([
    ...Object.keys(stats.uk.panel_size_distribution),
    ...Object.keys(stats.pl.panel_size_distribution),
  ])).sort((a, b) => parseInt(a) - parseInt(b));
  const ukPanels = allPanelSizes.map(s => (stats.uk.panel_size_distribution as Record<string, number>)[s] || 0);
  const plPanels = allPanelSizes.map(s => (stats.pl.panel_size_distribution as Record<string, number>)[s] || 0);

  // Court distribution — sorted by count.
  const ukCourts = Object.entries(stats.uk.court_distribution)
    .sort((a, b) => b[1] - a[1]);

  // Polish court names in the source data appear with two spellings of the
  // city stem ("Apelacyjnyw Warszawie" vs "Apelacyjny w Warszawie"). Normalize
  // and merge before ranking so the bar chart shows true volume per division.
  const plCourtsMap = new Map<string, number>();
  for (const [rawName, count] of Object.entries(stats.pl.court_distribution)) {
    const name = rawName
      .replace(/Apelacyjnywe\s/g, 'Apelacyjny we ')
      .replace(/Apelacyjnyw\s/g, 'Apelacyjny w ')
      .replace(/\s+/g, ' ')
      .trim();
    plCourtsMap.set(name, (plCourtsMap.get(name) ?? 0) + count);
  }
  const plCourts = Array.from(plCourtsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11);

  // Top judges
  const ukJudges = stats.uk.judges.top_10;
  const plJudges = stats.pl.judges.top_10;

  // Vocabulary domain words (filter stop words)
  const stopWords = new Set(['the','of','to','that','in','and','a','was','he','on','is','it','had','not','for','as','be','by','his','which','s','at','this','with','have','or','an','we','were','mr','there','she','from','her','no','would','but','any','said','they','if','are',
    'w','k','z','i','na','1','nie','do','o','się','2','a','p','r','to','co','od','tym','jest','3','4','po','jak','s','m','za','zw','przez','jego','tego']);
  const ukDomainWords = stats.uk.vocabulary.top_50_words
    .filter(w => !stopWords.has(w.word))
    .slice(0, 15);
  const plDomainWords = stats.pl.vocabulary.top_50_words
    .filter(w => !stopWords.has(w.word))
    .slice(0, 15);

  // Polish keywords (crime types)
  const plKeywords = stats.pl.keyword_distribution.slice(0, 15);

  // Judgment type distribution (PL) — top 5 + "Other" rollup so 13/6/4/2-case
  // slivers don't fragment the donut.
  const judgmentTypesAll = Object.entries(stats.pl.judgment_type_distribution)
    .sort((a, b) => b[1] - a[1]);
  const judgmentTypes: Array<[string, number]> = judgmentTypesAll.length <= 6
    ? (judgmentTypesAll as Array<[string, number]>)
    : [
        ...(judgmentTypesAll.slice(0, 5) as Array<[string, number]>),
        ['Other', judgmentTypesAll.slice(5).reduce((s, [, c]) => s + c, 0)] as [string, number],
      ];

  return (
    <PaperBackground grain className="min-h-screen">
      <div className="container mx-auto px-6 py-10 max-w-[1400px] text-foreground">
        <Breadcrumb
          items={[
            { label: 'Statistics', href: '/statistics' },
            { label: 'Dataset Comparison' },
          ]}
          className="mb-6"
        />

        <header className="mb-14">
          <Masthead badge="Comparative Law · Wroc&#322;aw" meta="VOL I · NO 1" ruled />
          <Headline as="h1" size="lg" className="mt-8 max-w-4xl">
            Cross-jurisdictional <em>dataset comparison</em>
          </Headline>
          <p className="mt-5 max-w-3xl text-lg leading-[1.65] text-[color:var(--ink-soft)]">
            Comparative analysis of{' '}
            <span className="editorial-numeral text-[color:var(--ink)]">6,050</span>{' '}
            UK and{' '}
            <span className="editorial-numeral text-[color:var(--oxblood)]">6,050</span>{' '}
            Polish criminal appellate court judgments, 2003&ndash;2024.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-7 bg-[color:var(--ink)]" />
              UK &middot; Court of Appeal, Criminal Division
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-7 bg-[color:var(--oxblood)]" />
              PL &middot; S&#261;d Apelacyjny, Wydzia&#322; Karny
            </span>
          </div>
        </header>

      {/* ── Overview Stats ── */}
      <Section numeral="01" eyebrow="Overview" title="Overview" description="Key statistics at a glance.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Judgments" ukValue={stats.uk.total} plValue={stats.pl.total} />
          <StatCard label="Avg. Characters" ukValue={Math.round(stats.uk.text_length_chars.mean)} plValue={Math.round(stats.pl.text_length_chars.mean)} />
          <StatCard label="Avg. Words" ukValue={Math.round(stats.uk.text_length_words.mean)} plValue={Math.round(stats.pl.text_length_words.mean)} />
          <StatCard label="Avg. Sentences" ukValue={Math.round(stats.uk.text_length_sentences.mean)} plValue={Math.round(stats.pl.text_length_sentences.mean)} />
          <StatCard label="Unique Judges" ukValue={stats.uk.judges.total_unique} plValue={stats.pl.judges.total_unique} />
          <StatCard label="Avg. Panel Size" ukValue={stats.uk.judges.avg_per_case} plValue={stats.pl.judges.avg_per_case} />
          <StatCard label="Unique Vocabulary" ukValue={stats.uk.vocabulary.unique_tokens_sample} plValue={stats.pl.vocabulary.unique_tokens_sample} />
          <StatCard label="Avg. Sentence Length" ukValue={stats.uk.avg_sentence_length} plValue={stats.pl.avg_sentence_length} format=" words" />
        </div>
      </Section>

      {/* ── Temporal Distribution ── */}
      <Section numeral="02" eyebrow="Temporal" title="Temporal Coverage" description="Annual case volume across 2003–2024, grouped by jurisdiction.">
        <ChartFigure
          figure="01"
          eyebrow="Temporal"
          title="Judgments per year"
          caption="Each bar pair shows judgments published in that year. UK coverage spans the full 2003–2024 window with a 2009 peak (442 cases); the Polish corpus only begins in 2012 and concentrates in 2013 (812 cases), reflecting when Sąd Apelacyjny criminal rulings began being published online."
          source="6,050 UK + 6,050 PL · 2003–2024"
          featured
        >
          <Plot
            data={[
              { x: allYears, y: ukYearCounts, type: 'bar', name: 'UK', marker: { color: UK } },
              { x: allYears, y: plYearCounts, type: 'bar', name: 'Poland', marker: { color: PL } },
            ]}
            layout={{
              ...editorialPlotLayout,
              barmode: 'group',
              xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Year' }, dtick: 2, tickangle: -45 },
              yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Number of judgments' } },
              height: 420,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Document Length ── */}
      <Section numeral="03" eyebrow="Length" title="Document Length" description="How long judgments are, in characters — distribution shape and five-number summary.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartFigure
            figure="02"
            eyebrow="Document Length"
            title="Character-count distribution"
            caption="A right-skewed distribution typical of court rulings: most judgments fall in the 10–30 K-character range, with a long tail beyond 100 K. Polish judgments sit slightly more polarized — heavier short-document mass and a longer tail (max 737 K vs UK 436 K)."
            source="6,050 UK + 6,050 PL"
          >
            <Plot
              data={[
                { x: lengthBuckets, y: ukLengths, type: 'bar', name: 'UK', marker: { color: UK } },
                { x: lengthBuckets, y: plLengths, type: 'bar', name: 'Poland', marker: { color: PL } },
              ]}
              layout={{
                ...editorialPlotLayout,
                barmode: 'group',
                xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Characters' } },
                yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Cases' } },
                height: 360,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
          <ChartFigure
            figure="03"
            eyebrow="Document Length"
            title="Character-count summary"
            caption="Boxes mark the interquartile range; whiskers extend to 1.5× IQR. UK and PL medians are nearly identical (~20 K characters), but the Polish box has a higher Q3 and a longer upper whisker — confirming a heavier tail of very long rulings."
            source="6,050 UK + 6,050 PL"
          >
            <Plot
              data={[
                {
                  type: 'box',
                  name: 'UK',
                  q1: [stats.uk.text_length_chars.p25],
                  median: [stats.uk.text_length_chars.median],
                  q3: [stats.uk.text_length_chars.p75],
                  lowerfence: [stats.uk.text_length_chars.min],
                  upperfence: [Math.min(stats.uk.text_length_chars.p75 + 1.5 * (stats.uk.text_length_chars.p75 - stats.uk.text_length_chars.p25), stats.uk.text_length_chars.max)],
                  marker: { color: UK },
                  line: { color: UK },
                  fillcolor: 'rgba(26,26,46,0.08)',
                  boxpoints: false,
                },
                {
                  type: 'box',
                  name: 'Poland',
                  q1: [stats.pl.text_length_chars.p25],
                  median: [stats.pl.text_length_chars.median],
                  q3: [stats.pl.text_length_chars.p75],
                  lowerfence: [stats.pl.text_length_chars.min],
                  upperfence: [Math.min(stats.pl.text_length_chars.p75 + 1.5 * (stats.pl.text_length_chars.p75 - stats.pl.text_length_chars.p25), stats.pl.text_length_chars.max)],
                  marker: { color: PL },
                  line: { color: PL },
                  fillcolor: 'rgba(139,30,63,0.10)',
                  boxpoints: false,
                },
              ]}
              layout={{
                ...editorialPlotLayout,
                yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Characters' } },
                height: 360,
                showlegend: false,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
        </div>
      </Section>

      {/* ── Word Count ── */}
      <Section numeral="04" eyebrow="Length" title="Word Count Distribution" description="Approximate words per judgment, in six size buckets.">
        <ChartFigure
          figure="04"
          eyebrow="Vocabulary"
          title="Word-count buckets"
          caption="Both corpora cluster in the 2–5 K word band, but a meaningful slice on each side exceeds 10 K words — useful for sizing context-window requirements when feeding rulings to an LLM."
          source="6,050 UK + 6,050 PL"
        >
          <Plot
            data={[
              { x: wordBuckets, y: ukWords, type: 'bar', name: 'UK', marker: { color: UK } },
              { x: wordBuckets, y: plWords, type: 'bar', name: 'Poland', marker: { color: PL } },
            ]}
            layout={{
              ...editorialPlotLayout,
              barmode: 'group',
              xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Words' } },
              yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Cases' } },
              height: 360,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Panel Size ── */}
      <Section numeral="05" eyebrow="Judiciary" title="Judicial Panel Size" description="Number of judges who sat on each appeal.">
        <ChartFigure
          figure="05"
          eyebrow="Judicial Panel"
          title="Panel-size distribution"
          caption="UK panels are usually 2–3 judges (≈86 % of cases), with single-judge listings still common. Polish appeals are dominated by 3-judge panels (4,694 / 6,050 ≈ 78 %), matching the Kodeks postępowania karnego default for Sąd Apelacyjny. The PL zero-judge bucket flags 461 cases where no judge was extracted — a metadata-quality signal worth noting."
          source="6,050 UK + 6,050 PL"
        >
          <Plot
            data={[
              { x: allPanelSizes.map(s => `${s} judge${parseInt(s) !== 1 ? 's' : ''}`), y: ukPanels, type: 'bar', name: 'UK', marker: { color: UK } },
              { x: allPanelSizes.map(s => `${s} judge${parseInt(s) !== 1 ? 's' : ''}`), y: plPanels, type: 'bar', name: 'Poland', marker: { color: PL } },
            ]}
            layout={{
              ...editorialPlotLayout,
              barmode: 'group',
              xaxis: { ...editorialPlotLayout.xaxis },
              yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Cases' } },
              height: 360,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Court Distribution ── */}
      <Section numeral="06" eyebrow="Jurisdiction" title="Court Distribution" description="Originating courts: a Crown Court-dominated UK pipeline vs. ten regional Polish appellate divisions.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartFigure
            figure="06"
            eyebrow="Jurisdiction · UK"
            title="UK courts of origin"
            caption="Crown Court provides 5,369 of 6,050 UK cases (89 %), as expected for the Court of Appeal (Criminal Division), with Supreme Court referrals contributing most of the remainder."
            source="6,050 UK · Court of Appeal, Criminal Division"
          >
            <Plot
              data={[{
                y: ukCourts.map(([name]) => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
                x: ukCourts.map(([, count]) => count),
                type: 'bar',
                orientation: 'h',
                marker: { color: UK },
              }]}
              layout={{
                ...editorialPlotLayout,
                xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
                margin: { ...editorialPlotLayout.margin, l: 200 },
                height: 320,
                showlegend: false,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
          <ChartFigure
            figure="07"
            eyebrow="Jurisdiction · PL"
            title="Polish appellate courts"
            caption="Warsaw, Katowice and Wrocław together produce nearly half the Polish sample. The two Wrocław spellings in the source data have been normalized and merged here."
            source="6,050 PL · Sąd Apelacyjny"
          >
            <Plot
              data={[{
                y: plCourts.map(([name]) => name),
                x: plCourts.map(([, count]) => count),
                type: 'bar',
                orientation: 'h',
                marker: { color: PL },
              }]}
              layout={{
                ...editorialPlotLayout,
                xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
                margin: { ...editorialPlotLayout.margin, l: 250 },
                height: Math.max(320, plCourts.length * 28),
                showlegend: false,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
        </div>
      </Section>

      {/* ── Top Judges ── */}
      <Section numeral="07" eyebrow="Judiciary" title="Most Active Judges" description="Most prolific authors in each jurisdiction (top 10 by case count).">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartFigure
            figure="08"
            eyebrow="Judiciary · UK"
            title="UK top-10 judges"
            caption="Most-cited UK criminal-appellate judges in the sample. The long tail behind these names is large — 1,766 unique UK judges across the corpus."
            source="Top 10 of 1,766 UK judges"
          >
            <RankedList items={ukJudges} color={UK} />
          </ChartFigure>
          <ChartFigure
            figure="09"
            eyebrow="Judiciary · PL"
            title="Polish top-10 judges"
            caption="Top contributors in Polish criminal appellate jurisprudence. With 876 unique PL judges overall, this top 10 represents a small but disproportionately influential cohort."
            source="Top 10 of 876 PL judges"
          >
            <RankedList items={plJudges} color={PL} />
          </ChartFigure>
        </div>
      </Section>

      {/* ── Vocabulary & Language ── */}
      <Section numeral="08" eyebrow="Vocabulary" title="Vocabulary Analysis" description="Lexical diversity and most frequent domain terms after stop-word filtering.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard label="Total Tokens (sample)" ukValue={stats.uk.vocabulary.total_tokens_sample} plValue={stats.pl.vocabulary.total_tokens_sample} />
          <StatCard label="Unique Tokens" ukValue={stats.uk.vocabulary.unique_tokens_sample} plValue={stats.pl.vocabulary.unique_tokens_sample} />
          <StatCard label="Type-Token Ratio" ukValue={stats.uk.vocabulary.type_token_ratio} plValue={stats.pl.vocabulary.type_token_ratio} />
          <StatCard label="Avg. Sentence Length" ukValue={stats.uk.avg_sentence_length} plValue={stats.pl.avg_sentence_length} format=" words" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartFigure
            figure="10"
            eyebrow="Vocabulary · UK"
            title="UK domain keywords"
            caption="Most frequent English domain terms after stop-word filtering — the everyday legal lexicon (court, appeal, evidence, sentence) that dominates criminal-appeal prose."
            source="Top 50 sample tokens · UK"
          >
            <Plot
              data={[{
                y: [...ukDomainWords].reverse().map(w => w.word),
                x: [...ukDomainWords].reverse().map(w => w.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: UK_SOFT },
                text: [...ukDomainWords].reverse().map(w => w.count.toLocaleString()),
                textposition: 'outside',
                textfont: { family: 'Geist Mono, ui-monospace, monospace', size: 11, color: UK },
              }]}
              layout={{
                ...editorialPlotLayout,
                xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Frequency' } },
                yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
                margin: { ...editorialPlotLayout.margin, l: 120 },
                height: 460,
                showlegend: false,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
          <ChartFigure
            figure="11"
            eyebrow="Vocabulary · PL"
            title="Polish domain keywords"
            caption="Polish counterparts of the same vocabulary stratum — useful for tuning embeddings, building synonym lists, or verifying corpus coverage of everyday legal prose."
            source="Top 50 sample tokens · PL"
          >
            <Plot
              data={[{
                y: [...plDomainWords].reverse().map(w => w.word),
                x: [...plDomainWords].reverse().map(w => w.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: PL_SOFT },
                text: [...plDomainWords].reverse().map(w => w.count.toLocaleString()),
                textposition: 'outside',
                textfont: { family: 'Geist Mono, ui-monospace, monospace', size: 11, color: PL },
              }]}
              layout={{
                ...editorialPlotLayout,
                xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Frequency' } },
                yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
                margin: { ...editorialPlotLayout.margin, l: 140 },
                height: 460,
                showlegend: false,
              }}
              config={editorialPlotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </ChartFigure>
        </div>
      </Section>

      {/* ── Polish Crime Topics ── */}
      <Section numeral="09" eyebrow="Criminology" title="Polish Crime Categories" description="Subject-matter tags attached to Polish appeals (4,639 of 6,050 tagged).">
        <ChartFigure
          figure="12"
          eyebrow="Criminology · PL"
          title="Top 15 Polish legal keywords"
          caption="Offence mix of Polish criminal appeals — fraud (Oszustwo), drug crimes (Narkomania), homicide (Zabójstwo) and robbery (Rozbój) lead. The UK side has no comparable structured tagging, which is why this chart is jurisdiction-specific."
          source="4,639 / 6,050 PL cases tagged"
        >
          <Plot
            data={[{
              y: [...plKeywords].reverse().map(k => k.keyword),
              x: [...plKeywords].reverse().map(k => k.count),
              type: 'bar',
              orientation: 'h',
              marker: { color: PL },
              text: [...plKeywords].reverse().map(k => k.count.toString()),
              textposition: 'outside',
              textfont: { family: 'Geist Mono, ui-monospace, monospace', size: 11, color: PL },
            }]}
            layout={{
              ...editorialPlotLayout,
              xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Cases' } },
              yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
              margin: { ...editorialPlotLayout.margin, l: 350 },
              height: 520,
              showlegend: false,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Judgment Types (PL) ── */}
      <Section numeral="10" eyebrow="Document Type" title="Polish Judgment Types" description="Document-type composition of the Polish corpus.">
        <ChartFigure
          figure="13"
          eyebrow="Document Type · PL"
          title="Judgment-type breakdown"
          caption="Most Polish entries are combined Sentence + Reason documents (3,724 of 6,050 ≈ 62 %), followed by sentence-only and reason-only filings — a structural fact that affects how text should be chunked for retrieval."
          source="6,050 PL · top 5 of 10 type combinations + rollup"
        >
          <Plot
            data={[{
              labels: judgmentTypes.map(([type]) => type),
              values: judgmentTypes.map(([, count]) => count),
              type: 'pie',
              hole: 0.45,
              marker: {
                colors: editorialCategorical,
                line: { color: '#F5F1E8', width: 2 },
              },
              textinfo: 'label+percent',
              textposition: 'outside',
              textfont: { family: 'Geist, system-ui, sans-serif', size: 11, color: '#1A1A2E' },
              hoverlabel: { font: { family: 'Geist, system-ui, sans-serif', size: 12, color: '#F5F1E8' } },
            }]}
            layout={{
              ...editorialPlotLayout,
              height: 460,
              showlegend: false,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Decade Distribution ── */}
      <Section numeral="11" eyebrow="Temporal" title="Decade Distribution" description="Coarse-grained temporal shape of each corpus.">
        <ChartFigure
          figure="14"
          eyebrow="Temporal"
          title="Judgments by decade"
          caption="Aggregates the year chart into decade bands. The UK corpus has meaningful 2000s coverage (2,192 cases); the Polish corpus is concentrated post-2010 — a constraint for any longitudinal cross-jurisdictional comparison earlier than 2012."
          source="6,050 UK + 6,050 PL · decade aggregation"
        >
          <Plot
            data={[
              {
                x: Object.keys(stats.uk.decade_distribution),
                y: Object.values(stats.uk.decade_distribution),
                type: 'bar',
                name: 'UK',
                marker: { color: UK },
                text: Object.values(stats.uk.decade_distribution).map(v => v.toLocaleString()),
                textposition: 'outside',
                textfont: { family: 'Geist Mono, ui-monospace, monospace', size: 11, color: UK },
              },
              {
                x: Object.keys(stats.pl.decade_distribution),
                y: Object.values(stats.pl.decade_distribution),
                type: 'bar',
                name: 'Poland',
                marker: { color: PL },
                text: Object.values(stats.pl.decade_distribution).map(v => v.toLocaleString()),
                textposition: 'outside',
                textfont: { family: 'Geist Mono, ui-monospace, monospace', size: 11, color: PL },
              },
            ]}
            layout={{
              ...editorialPlotLayout,
              barmode: 'group',
              xaxis: { ...editorialPlotLayout.xaxis, title: { text: 'Decade' } },
              yaxis: { ...editorialPlotLayout.yaxis, title: { text: 'Cases' } },
              height: 360,
            }}
            config={editorialPlotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </ChartFigure>
      </Section>

      {/* ── Methodology ── */}
      <Section numeral="12" eyebrow="Method" title="Methodology">
        <div className="editorial-card p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
                UK Dataset
              </span>
              <h3 className="mt-1.5 font-serif text-xl text-[color:var(--ink)] leading-tight">
                Court of Appeal, <em>Criminal Division</em>
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                <li><span className="text-[color:var(--ink-soft)]">Source ·</span> <code className="font-mono text-[color:var(--ink)]">JuDDGES/en-court-raw</code></li>
                <li><span className="editorial-numeral text-[color:var(--ink)]">6,050</span> criminal appellate judgments</li>
                <li>Period <span className="editorial-numeral text-[color:var(--ink)]">2003</span>&ndash;<span className="editorial-numeral text-[color:var(--ink)]">2024</span></li>
              </ul>
            </div>
            <div>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--oxblood)]">
                Polish Dataset
              </span>
              <h3 className="mt-1.5 font-serif text-xl text-[color:var(--ink)] leading-tight">
                S&#261;d Apelacyjny, <em>Wydzia&#322; Karny</em>
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                <li><span className="text-[color:var(--ink-soft)]">Source ·</span> <code className="font-mono text-[color:var(--ink)]">JuDDGES/pl-court-raw</code> <span className="text-[color:var(--ink-soft)]">(437,450 total)</span></li>
                <li>Stratified sample <span className="editorial-numeral text-[color:var(--oxblood)]">6,050</span> of <span className="editorial-numeral text-[color:var(--ink)]">14,930</span> matches</li>
                <li>Published as <code className="font-mono text-[color:var(--ink)]">JuDDGES/pl-appealcourt-criminal</code></li>
                <li>Period <span className="editorial-numeral text-[color:var(--ink)]">2003</span>&ndash;<span className="editorial-numeral text-[color:var(--ink)]">2024</span> (matching UK range)</li>
              </ul>
            </div>
          </div>
          <hr className="my-6 border-0 border-t border-[color:var(--rule)]" />
          <p className="text-sm leading-[1.7] text-[color:var(--ink-soft)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold)]">Note</span>{' '}
            Vocabulary statistics computed on a representative sample. Type-Token Ratio (TTR) measures lexical diversity &mdash; Polish&apos;s <span className="editorial-numeral text-[color:var(--oxblood)]">2.8&times;</span> higher TTR reflects its rich morphological system (case inflections, verb conjugations).
          </p>
        </div>
      </Section>
      </div>
    </PaperBackground>
  );
}
