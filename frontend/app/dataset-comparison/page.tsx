'use client';

import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import stats from '@/lib/stats/dataset-comparison-stats.json';

const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

// Colors
const UK_COLOR = '#3b82f6';
const PL_COLOR = '#ef4444';
const UK_LIGHT = '#93c5fd';
const PL_LIGHT = '#fca5a5';

function StatCard({ label, ukValue, plValue, format }: {
  label: string;
  ukValue: string | number;
  plValue: string | number;
  format?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground mb-3">{label}</p>
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: UK_COLOR }}>UK</p>
          <p className="text-xl font-bold">{typeof ukValue === 'number' ? ukValue.toLocaleString() : ukValue}{format}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium mb-1" style={{ color: PL_COLOR }}>PL</p>
          <p className="text-xl font-bold">{typeof plValue === 'number' ? plValue.toLocaleString() : plValue}{format}</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-1">{title}</h2>
      {description && <p className="text-muted-foreground mb-4">{description}</p>}
      {children}
    </section>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const defaultLayout: Record<string, any> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#a1a1aa', family: 'system-ui, sans-serif', size: 12 },
  margin: { l: 60, r: 30, t: 40, b: 60 },
  xaxis: { gridcolor: '#27272a', zerolinecolor: '#27272a' },
  yaxis: { gridcolor: '#27272a', zerolinecolor: '#27272a' },
  legend: { orientation: 'h' as const, y: -0.15, x: 0.5, xanchor: 'center' as const },
  autosize: true,
};

const plotConfig: Record<string, any> = {
  displayModeBar: false,
  responsive: true,
};

export default function DatasetComparisonPage() {
  // Prepare year distribution data (aligned on all years)
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

  // Court distribution - sorted by count
  const ukCourts = Object.entries(stats.uk.court_distribution)
    .sort((a, b) => b[1] - a[1]);
  const plCourts = Object.entries(stats.pl.court_distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11); // Top 11 (merge duplicates visually)

  // Top judges
  const ukJudges = stats.uk.judges.top_10;
  const plJudges = stats.pl.judges.top_10;

  // Stop words filtered out of vocabulary plots so only domain-relevant
  // legal terminology is shown. Covers function words, pronouns, single-letter
  // tokens, digits, and Polish legal-document boilerplate (article references,
  // date stamps, currency, common abbreviations).
  const stopWords = new Set([
    // English function words / pronouns
    'the','of','to','that','in','and','a','an','was','were','is','are','be','been','being',
    'he','she','it','they','we','i','you','him','her','his','hers','its','their','them','our','your','my',
    'on','at','by','for','from','with','into','onto','upon','about','against','through',
    'as','or','but','if','not','no','yes','this','that','these','those','which','who','whom','whose','what','when','where','why','how',
    'have','has','had','having','do','does','did','doing','will','would','shall','should','can','could','may','might','must',
    'said','say','says','there','here','also','only','just','than','then','so','such','any','some','all','each','every','one','two',
    // English titles / generic
    'mr','mrs','miss','ms','dr','sir','madam',
    // Single-letter / OCR-noise English
    's','t','d','m','re','ve','ll',
    // Polish function words / pronouns / conjunctions
    'w','z','i','o','a','u','e','na','do','od','po','za','ze','we','przez','dla','przy','nad','pod','mi\u0119dzy','wobec','bez','oraz','lub','albo','czy','ale','wi\u0119c','te\u017c','ju\u017c','jeszcze','tylko','tak\u017ce','jak','jako','tak','nie','tak','to','co','kto','kogo','komu','kim','czym','tego','tym','temu','tej','t\u0119','ta','te','ten','ci','ich','im','je','j\u0105','mu','jej','jego','sw\u00f3j','swoja','swoje','swoich',
    '\u017ce','i\u017c','aby','\u017ceby','poniewa\u017c','gdy\u017c','cho\u0107','chocia\u017c','je\u017celi','je\u015bli','gdy','kiedy','dop\u00f3ki',
    'by\u0107','jest','s\u0105','by\u0142','by\u0142a','by\u0142o','byli','by\u0142y','b\u0119dzie','b\u0119d\u0105','by\u0107','mie\u0107','ma','maj\u0105','mia\u0142','mia\u0142a',
    'si\u0119','siebie','sob\u0105','sobie',
    // Polish legal-document boilerplate / abbreviations
    'art','zart','pkt','ust','ust.','par','\u00a7','zw','zw.','nr','tj','m.in','itp','itd',
    'dnia','roku','rok','lat','lata','miesi\u0119cy','miesi\u0105ca','miesi\u0105ce','godzin','godziny',
    'z\u0142','zlotych','z\u0142otych','euro','usd','pln',
    // Polish single-letter / abbreviation noise (k.k., p., r., m., s., b.)
    'k','p','r','b','c','d','s','m','n','t','x','y',
    // Digits
    '0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15',
  ]);
  const ukDomainWords = stats.uk.vocabulary.top_50_words
    .filter(w => !stopWords.has(w.word))
    .slice(0, 15);
  const plDomainWords = stats.pl.vocabulary.top_50_words
    .filter(w => !stopWords.has(w.word))
    .slice(0, 15);

  // Polish keywords (crime types)
  const plKeywords = stats.pl.keyword_distribution.slice(0, 15);

  // Judgment type distribution (PL)
  const judgmentTypes = Object.entries(stats.pl.judgment_type_distribution)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-[1400px] min-h-screen bg-background text-foreground">
      <Breadcrumb
        items={[
          { label: 'Statistics', href: '/statistics' },
          { label: 'Dataset Comparison' },
        ]}
        className="mb-6"
      />

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Cross-Jurisdictional Dataset Comparison</h1>
        <p className="text-lg text-muted-foreground">
          Comparative analysis of 6,050 UK and 6,050 Polish criminal appellate court judgments (2003&ndash;2024)
        </p>
        <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: UK_COLOR }} />
            UK &mdash; Court of Appeal, Criminal Division
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: PL_COLOR }} />
            PL &mdash; S&#261;d Apelacyjny, Wydzia&#322; Karny
          </span>
        </div>
      </div>

      {/* ── Overview Stats ── */}
      <Section title="Overview" description="Key statistics at a glance">
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
      <Section title="Temporal Coverage" description="Distribution of judgments by year">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[
              { x: allYears, y: ukYearCounts, type: 'bar', name: 'UK', marker: { color: UK_COLOR } },
              { x: allYears, y: plYearCounts, type: 'bar', name: 'Poland', marker: { color: PL_COLOR } },
            ]}
            layout={{
              ...defaultLayout,
              barmode: 'group',
              title: { text: 'Judgments per Year', font: { size: 14, color: '#e4e4e7' } },
              xaxis: { ...defaultLayout.xaxis, title: { text: 'Year' }, dtick: 1, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: { text: 'Number of Judgments' } },
              height: 400,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Document Length ── */}
      <Section title="Document Length" description="Character-based length distribution and box plots">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[
                { x: lengthBuckets, y: ukLengths, type: 'bar', name: 'UK', marker: { color: UK_COLOR } },
                { x: lengthBuckets, y: plLengths, type: 'bar', name: 'Poland', marker: { color: PL_COLOR } },
              ]}
              layout={{
                ...defaultLayout,
                barmode: 'group',
                title: { text: 'Character Count Distribution', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Characters' } },
                yaxis: { ...defaultLayout.yaxis, title: { text: 'Count' } },
                height: 350,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[
                {
                  type: 'box',
                  name: 'UK',
                  y: [stats.uk.text_length_chars.min, stats.uk.text_length_chars.p25, stats.uk.text_length_chars.median, stats.uk.text_length_chars.p75, stats.uk.text_length_chars.max],
                  q1: [stats.uk.text_length_chars.p25],
                  median: [stats.uk.text_length_chars.median],
                  q3: [stats.uk.text_length_chars.p75],
                  lowerfence: [stats.uk.text_length_chars.min],
                  upperfence: [Math.min(stats.uk.text_length_chars.p75 + 1.5 * (stats.uk.text_length_chars.p75 - stats.uk.text_length_chars.p25), stats.uk.text_length_chars.max)],
                  marker: { color: UK_COLOR },
                  boxpoints: false,
                },
                {
                  type: 'box',
                  name: 'Poland',
                  y: [stats.pl.text_length_chars.min, stats.pl.text_length_chars.p25, stats.pl.text_length_chars.median, stats.pl.text_length_chars.p75, stats.pl.text_length_chars.max],
                  q1: [stats.pl.text_length_chars.p25],
                  median: [stats.pl.text_length_chars.median],
                  q3: [stats.pl.text_length_chars.p75],
                  lowerfence: [stats.pl.text_length_chars.min],
                  upperfence: [Math.min(stats.pl.text_length_chars.p75 + 1.5 * (stats.pl.text_length_chars.p75 - stats.pl.text_length_chars.p25), stats.pl.text_length_chars.max)],
                  marker: { color: PL_COLOR },
                  boxpoints: false,
                },
              ]}
              layout={{
                ...defaultLayout,
                title: { text: 'Character Count Summary', font: { size: 14, color: '#e4e4e7' } },
                yaxis: { ...defaultLayout.yaxis, title: { text: 'Characters' } },
                height: 350,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Section>

      {/* ── Word Count ── */}
      <Section title="Word Count Distribution" description="Approximate word counts per judgment">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[
              { x: wordBuckets, y: ukWords, type: 'bar', name: 'UK', marker: { color: UK_COLOR } },
              { x: wordBuckets, y: plWords, type: 'bar', name: 'Poland', marker: { color: PL_COLOR } },
            ]}
            layout={{
              ...defaultLayout,
              barmode: 'group',
              title: { text: 'Word Count Buckets', font: { size: 14, color: '#e4e4e7' } },
              xaxis: { ...defaultLayout.xaxis, title: { text: 'Words' } },
              yaxis: { ...defaultLayout.yaxis, title: { text: 'Count' } },
              height: 350,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Panel Size ── */}
      <Section title="Judicial Panel Size" description="Number of judges per case">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[
              { x: allPanelSizes.map(s => `${s} judge${parseInt(s) !== 1 ? 's' : ''}`), y: ukPanels, type: 'bar', name: 'UK', marker: { color: UK_COLOR } },
              { x: allPanelSizes.map(s => `${s} judge${parseInt(s) !== 1 ? 's' : ''}`), y: plPanels, type: 'bar', name: 'Poland', marker: { color: PL_COLOR } },
            ]}
            layout={{
              ...defaultLayout,
              barmode: 'group',
              title: { text: 'Panel Size Distribution', font: { size: 14, color: '#e4e4e7' } },
              xaxis: { ...defaultLayout.xaxis },
              yaxis: { ...defaultLayout.yaxis, title: { text: 'Cases' } },
              height: 350,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Court Distribution ── */}
      <Section title="Court Distribution" description="Cases by originating court">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: ukCourts.map(([name]) => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
                x: ukCourts.map(([, count]) => count),
                type: 'bar',
                orientation: 'h',
                marker: { color: UK_COLOR },
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'UK Courts of Origin', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 200 },
                height: 300,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: plCourts.map(([name]) => name),
                x: plCourts.map(([, count]) => count),
                type: 'bar',
                orientation: 'h',
                marker: { color: PL_COLOR },
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'Polish Appellate Courts', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 250 },
                height: Math.max(300, plCourts.length * 28),
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Section>

      {/* ── Top Judges ── */}
      <Section title="Most Active Judges" description="Top 10 judges by number of cases">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: [...ukJudges].reverse().map(j => j.name),
                x: [...ukJudges].reverse().map(j => j.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: UK_COLOR },
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'UK Top 10 Judges', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 200 },
                height: 400,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: [...plJudges].reverse().map(j => j.name),
                x: [...plJudges].reverse().map(j => j.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: PL_COLOR },
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'Polish Top 10 Judges', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Cases' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 200 },
                height: 400,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Section>

      {/* ── Vocabulary & Language ── */}
      <Section title="Vocabulary Analysis" description="Lexical diversity and domain-specific terminology">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatCard label="Total Tokens (sample)" ukValue={stats.uk.vocabulary.total_tokens_sample} plValue={stats.pl.vocabulary.total_tokens_sample} />
          <StatCard label="Unique Tokens" ukValue={stats.uk.vocabulary.unique_tokens_sample} plValue={stats.pl.vocabulary.unique_tokens_sample} />
          <StatCard label="Type-Token Ratio" ukValue={stats.uk.vocabulary.type_token_ratio} plValue={stats.pl.vocabulary.type_token_ratio} />
          <StatCard label="Avg. Sentence Length" ukValue={stats.uk.avg_sentence_length} plValue={stats.pl.avg_sentence_length} format=" words" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: [...ukDomainWords].reverse().map(w => w.word),
                x: [...ukDomainWords].reverse().map(w => w.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: UK_LIGHT },
                text: [...ukDomainWords].reverse().map(w => w.count.toLocaleString()),
                textposition: 'outside',
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'UK Domain Keywords', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Frequency' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 120 },
                height: 450,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Plot
              data={[{
                y: [...plDomainWords].reverse().map(w => w.word),
                x: [...plDomainWords].reverse().map(w => w.count),
                type: 'bar',
                orientation: 'h',
                marker: { color: PL_LIGHT },
                text: [...plDomainWords].reverse().map(w => w.count.toLocaleString()),
                textposition: 'outside',
              }]}
              layout={{
                ...defaultLayout,
                title: { text: 'Polish Domain Keywords', font: { size: 14, color: '#e4e4e7' } },
                xaxis: { ...defaultLayout.xaxis, title: { text: 'Frequency' } },
                yaxis: { ...defaultLayout.yaxis, automargin: true },
                margin: { ...defaultLayout.margin, l: 140 },
                height: 450,
                showlegend: false,
              }}
              config={plotConfig}
              className="w-full"
              useResizeHandler
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </Section>

      {/* ── Polish Crime Topics ── */}
      <Section title="Polish Crime Categories" description="Keywords tagged on Polish criminal appellate judgments (4,639 of 6,050 cases have keywords)">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[{
              y: [...plKeywords].reverse().map(k => k.keyword),
              x: [...plKeywords].reverse().map(k => k.count),
              type: 'bar',
              orientation: 'h',
              marker: { color: PL_COLOR },
              text: [...plKeywords].reverse().map(k => k.count.toString()),
              textposition: 'outside',
            }]}
            layout={{
              ...defaultLayout,
              title: { text: 'Top 15 Polish Legal Keywords', font: { size: 14, color: '#e4e4e7' } },
              xaxis: { ...defaultLayout.xaxis, title: { text: 'Cases' } },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              margin: { ...defaultLayout.margin, l: 350 },
              height: 500,
              showlegend: false,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Judgment Types (PL) ── */}
      <Section title="Polish Judgment Types" description="Distribution of judgment document types">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[{
              labels: judgmentTypes.map(([type]) => type),
              values: judgmentTypes.map(([, count]) => count),
              type: 'pie',
              hole: 0.4,
              marker: {
                colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'],
              },
              textinfo: 'label+percent',
              textposition: 'outside',
              textfont: { size: 11 },
            }]}
            layout={{
              ...defaultLayout,
              title: { text: 'Judgment Type Breakdown', font: { size: 14, color: '#e4e4e7' } },
              height: 450,
              showlegend: false,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Decade Distribution ── */}
      <Section title="Decade Distribution" description="Temporal clustering by decade">
        <div className="rounded-xl border bg-card p-4">
          <Plot
            data={[
              {
                x: Object.keys(stats.uk.decade_distribution),
                y: Object.values(stats.uk.decade_distribution),
                type: 'bar',
                name: 'UK',
                marker: { color: UK_COLOR },
                text: Object.values(stats.uk.decade_distribution).map(v => v.toLocaleString()),
                textposition: 'outside',
              },
              {
                x: Object.keys(stats.pl.decade_distribution),
                y: Object.values(stats.pl.decade_distribution),
                type: 'bar',
                name: 'Poland',
                marker: { color: PL_COLOR },
                text: Object.values(stats.pl.decade_distribution).map(v => v.toLocaleString()),
                textposition: 'outside',
              },
            ]}
            layout={{
              ...defaultLayout,
              barmode: 'group',
              title: { text: 'Judgments by Decade', font: { size: 14, color: '#e4e4e7' } },
              xaxis: { ...defaultLayout.xaxis, title: { text: 'Decade' } },
              yaxis: { ...defaultLayout.yaxis, title: { text: 'Cases' } },
              height: 350,
            }}
            config={plotConfig}
            className="w-full"
            useResizeHandler
            style={{ width: '100%' }}
          />
        </div>
      </Section>

      {/* ── Methodology ── */}
      <Section title="Methodology">
        <div className="rounded-xl border bg-card p-6 prose prose-invert max-w-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: UK_COLOR }}>UK Dataset</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Source: <code>JuDDGES/en-court-raw</code> on HuggingFace</li>
                <li>6,050 criminal appellate judgments</li>
                <li>Court of Appeal, Criminal Division</li>
                <li>Period: 2003&ndash;2024</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: PL_COLOR }}>Polish Dataset</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Source: <code>JuDDGES/pl-court-raw</code> (437,450 total)</li>
                <li>Filtered: S&#261;d Apelacyjny + Wydzia&#322; Karny</li>
                <li>Stratified sample: 6,050 of 14,930 matches</li>
                <li>Published as <code>JuDDGES/pl-appealcourt-criminal</code></li>
                <li>Period: 2003&ndash;2024 (matching UK range)</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Vocabulary statistics computed on a representative sample. Type-Token Ratio (TTR) measures lexical diversity&mdash;Polish&apos;s 2.8&times; higher TTR reflects its rich morphological system (case inflections, verb conjugations).
          </p>
        </div>
      </Section>
    </div>
  );
}
