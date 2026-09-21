/** @jest-environment node */

/**
 * Per-file hard gate for the Editorial migration (#639).
 *
 * `scripts/assert-no-banned-classes.js` ratchets the *total* count of
 * pre-Editorial tells downwards. This test is the stricter, file-level
 * complement: every file listed here has been migrated and must stay at zero.
 * Add a file once it is clean; never remove one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { countBannedPatterns } = require('../../scripts/assert-no-banned-classes');

const ROOT = join(__dirname, '../..');

const CLEAN_FILES = [
  'components/ui/accordion.tsx',
  'components/ui/button.tsx',
  'components/ui/card.tsx',
  'components/ui/command.tsx',
  'components/ui/logo.tsx',
  'components/ui/progress.tsx',
  'components/ui/sidebar.tsx',
  'lib/styles/components/ai-badge.tsx',
  'lib/styles/components/badge.tsx',
  'lib/styles/components/badges.ts',
  'lib/styles/components/base-card.tsx',
  'lib/styles/components/button-variants.ts',
  'lib/styles/components/empty-state.tsx',
  'lib/styles/components/error-card.tsx',
  'lib/styles/components/headers.ts',
  'lib/styles/components/juddges-logo.tsx',
  'lib/styles/components/light-card.tsx',
  'lib/styles/components/loading-indicator.tsx',
  'lib/styles/components/page-container.tsx',
  'components/judge-fingerprint/JudgeRadarChart.tsx',
  'components/reasoning-lines/DriftChart.tsx',
  'components/reasoning-lines/OutcomeTimeline.tsx',
  'components/reasoning-lines/ReasoningDAG.tsx',
  'lib/charts/reasoning-palette.ts',
  'app/about/page.tsx',
  'app/extractions/page.tsx',
  'app/extractions/[id]/_components/ExtractionJobClient.tsx',
  'app/extract/_components/ExtractionJobCard.tsx',
  'app/extract/_components/ExtractionConfigPanel.tsx',
  'app/extract/_components/RecentExtractions.tsx',
  'app/extract/_components/DocumentSelector.tsx',
  'app/extract/_components/types.ts',
  'app/precedents/page.tsx',
  'app/reasoning-lines/page.tsx',
  'app/reasoning-lines/[id]/page.tsx',
  'app/collections/page.tsx',
  'app/collections/[id]/_components/AddDocumentsDialog.tsx',
  'app/collections/[id]/_components/DocumentsCardGrid.tsx',
  'app/collections/[id]/_components/DocumentsToolbar.tsx',
  'app/collections/[id]/_components/EditCollectionForm.tsx',
  'app/collections/[id]/_components/EmptyCollectionState.tsx',
  'app/collections/[id]/client.tsx',
  'app/collections/error.tsx',
  'app/documents/[id]/_components/DocumentHeader.tsx',
  'app/documents/[id]/_components/DocumentBody.tsx',
  'app/documents/[id]/_components/SanitizedHtmlView.tsx',
  'app/documents/[id]/_components/AuthRequiredAIActionsNotice.tsx',
  'app/documents/[id]/_components/KeyPointsPanel.tsx',
  'app/documents/[id]/_components/AISummaryPanel.tsx',
  'app/documents/[id]/_components/SummaryThesisSection.tsx',
  'app/documents/[id]/_components/RelatedDocuments.tsx',
  'components/collection-documents-table.tsx',
  'components/document-metadata-view.tsx',
  'lib/styles/components/search-document-card.tsx',
  'components/search/ZeroResultsEmptyState.tsx',
  'components/chat/MessageSources.tsx',
  'components/chat/ExportChatDialog.tsx',
  'app/chat/[id]/ChatDetailClient.tsx',
  'app/chat/error.tsx',
  'app/chat/page.tsx',
  'lib/styles/components/chat/chat-interface.tsx',
  'lib/styles/components/chat/chat-message-styles.tsx',
  'app/search/page.tsx',
  'components/blog/blog-post-card.tsx',
  'components/publications/publication-card.tsx',
  'app/blog/page.tsx',
  'components/blog/markdown-renderer.tsx',
  'components/blog/admin/post-editor.tsx',
  'components/publications/admin/publication-form.tsx',
  'app/blog/admin/[id]/page.tsx',
  'app/publications/admin/page.tsx',
  'components/login-form-enhanced.tsx',
  'components/sign-up-form.tsx',
  'components/forgot-password-form.tsx',
  'components/update-password-form.tsx',
  'components/navbar.tsx',
  'components/app-sidebar.tsx',
  'components/onboarding/welcome-modal.tsx',
  'app/admin/page.tsx',
  'components/SaveSearchDialog.tsx',
  'components/ChunkErrorBoundary.tsx',
  'app/admin/content/page.tsx',
  'app/admin/documents/page.tsx',
  'app/admin/system/page.tsx',
  'app/admin/users/page.tsx',
  'app/settings/page.tsx',
  'app/settings/_components/embedding-models-section.tsx',
  'components/judge-fingerprint/JudgeProfileCard.tsx',
  'components/judge-fingerprint/JudgeSearch.tsx',
  'components/errors/ErrorBoundary.tsx',
  'components/errors/ChatErrorBoundary.tsx',
  'components/errors/SearchErrorBoundary.tsx',
  'components/status/ServiceCard.tsx',
  'components/legal/professional-acknowledgment.tsx',
  'components/admin/AdminGuard.tsx',
  'components/extraction-results-table.tsx',
  'lib/styles/components/calendar.tsx',
  'lib/styles/components/search-filters.tsx',
  'lib/styles/components/advanced-filter-panel.tsx',
  'lib/styles/components/search/SearchEmptyState.tsx',
  'lib/styles/components/search/SearchHeader.tsx',
  'lib/styles/components/search/SearchForm.tsx',
  'lib/styles/components/search/SearchResultsSection.tsx',
  'lib/styles/components/search-input.tsx',
  'lib/styles/components/search-result-feedback.tsx',
  'lib/styles/components/document-dialog.tsx',
  'components/SaveSearchDialog.tsx',
  'app/saved-searches/page.tsx',
  'lib/styles/components/chat/chat-message.tsx',
  'lib/styles/components/chat/chat-input.tsx',
  'lib/styles/components/chat/chat-history.tsx',
  'lib/styles/components/chat/chat-container.tsx',
  'lib/styles/components/chat/chat-message-list.tsx',
  'lib/styles/components/chat/chat-interface.tsx',
  'lib/styles/components/chat/chat-message-styles.tsx',
  'lib/styles/components/schema-status-selector.tsx',
  'lib/styles/components/schemas/SchemaActionsBar.tsx',
  'lib/styles/components/schemas/SchemaCard.tsx',
  'lib/styles/components/schemas/SchemaPreview.tsx',
  'lib/styles/components/schema-preview.tsx',
  'app/schemas/page.tsx',
  'app/schemas/[id]/client.tsx',
  'app/schemas/base/page.tsx',
  'app/status/page.tsx',
  'app/help/page.tsx',
  'app/terms/page.tsx',
  'app/argumentation-analysis/page.tsx',
  'app/legal/disclaimer/page.tsx',
  'app/ecosystem/page.tsx',
  'app/team/page.tsx',
  'app/contact/page.tsx',
  'app/history/page.tsx',
  'app/judge-fingerprint/page.tsx',
  'app/auth/error/page.tsx',
  'app/auth/login/page.tsx',
  'lib/document-fields.ts',
  'components/schema-studio/FieldCard.tsx',
  'components/schema-studio/FieldEditor.tsx',
  'components/schema-studio/versions/VersionsTab.tsx',
  'lib/schema-editor/rjsf/custom-widgets/DescriptionWidget.tsx',
  'lib/schema-editor/rjsf/rjsf-config.ts',
  'types/schema-playground.ts',
  'lib/styles/colors/surfaces.ts',
  'lib/styles/components/buttons.ts',
  'lib/styles/components/button.tsx',
  'lib/styles/components/variant-button.tsx',
  'lib/styles/components/delete-button.tsx',
  'lib/styles/components/toggle-button.tsx',
  'lib/styles/components/dropdown-button.tsx',
  'lib/styles/components/searchable-dropdown-button.tsx',
  'lib/styles/components/HeaderWithIcon.tsx',
  'lib/styles/components/secondary-header.tsx',
  'lib/styles/components/item-header.tsx',
  'lib/styles/components/section-header.tsx',
  'lib/styles/components/descriptions.ts',
  'lib/styles/components/item-feedback.tsx',
  'lib/styles/components/save-to-collection-popover.tsx',
  'lib/styles/components/delete-confirmation-dialog.tsx',
  'lib/styles/components/success-toast.tsx',
  'lib/styles/components/tooltip.tsx',
  'lib/styles/components/key-information.tsx',
  'lib/styles/components/document-field-card.tsx',
  'lib/styles/components/user-card.tsx',
  'lib/styles/components/user-avatar.tsx',
  'components/error-boundary.tsx',
  'app/publications/admin/[id]/page.tsx',
  'lib/styles/components/highlighted-text.tsx',
  // #676 slice 3 — remaining lib primitives
  'lib/styles/components/data-table.tsx',
  'lib/styles/components/ai-disclaimer-badge.tsx',
  'lib/styles/components/editorial-tabs.tsx',
  'lib/styles/components/legal-reference-badge.tsx',
  'lib/styles/components/pagination.tsx',
  'lib/styles/components/checkbox.tsx',
  'lib/styles/components/filter-toggle-group.tsx',
  'lib/styles/components/accordion.tsx',
  'lib/styles/components/index.ts',
  'components/ui/empty-state.tsx',
  'components/ui/switch.tsx',
  'components/ui/skeletons/SkeletonText.tsx',
  // #713 - surfaced by the CSS-property patterns and the radius boundary fix
  'lib/styles/components.css',
  'lib/styles/components/collapsible-button.tsx',
  'components/ui/checkbox.tsx',
  'components/ui/tooltip.tsx',
];

/**
 * Recharts writes `stroke`/`fill` as SVG presentation attributes, where
 * `hsl(var(--border))` is invalid twice over: the tokens are already full
 * colours (see tests/unit/app/globals-css-tokens.test.ts), and `var()` does
 * not resolve in attributes. Charts must take literal hex from
 * `lib/charts/editorial-plot.ts`.
 */
const RECHARTS_FILES = [
  'components/judge-fingerprint/JudgeRadarChart.tsx',
  'components/reasoning-lines/DriftChart.tsx',
  'components/reasoning-lines/OutcomeTimeline.tsx',
];

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('migrated files stay free of banned classes', () => {
  it.each(CLEAN_FILES)('%s', (file) => {
    const counts = countBannedPatterns([{ path: file, content: read(file) }]);
    const hits = Object.fromEntries(Object.entries(counts).filter(([, n]) => n !== 0));
    expect(hits).toEqual({});
  });
});

describe('recharts components', () => {
  it.each(RECHARTS_FILES)('%s has no hsl(var(--…)) colours', (file) => {
    expect(read(file)).not.toMatch(/hsl\(\s*var\(--/);
  });
});

/** Canvas + recharts charts: every colour comes from `editorialPalette`, never a literal. */
const CHART_FILES = [...RECHARTS_FILES, 'components/reasoning-lines/ReasoningDAG.tsx'];

describe('chart components', () => {
  it.each(CHART_FILES)('%s has no colour literals (hex, rgb(), hsl())', (file) => {
    expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });
});

describe('app/about/page.tsx', () => {
  it('carries no marketing superlatives (#641 copy list)', () => {
    expect(read('app/about/page.tsx')).not.toMatch(
      /world-class|cutting-edge|innovative|state-of-the-art|revolutioniz|Empower|AI-powered/,
    );
  });
});

describe('components/ui/sidebar.tsx', () => {
  const source = read('components/ui/sidebar.tsx');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });

  it('has no empty variant-modifier tokens (`hover: `, `data-[active=true]: `)', () => {
    expect(source.match(/(?:hover|data-\[active=true\]):(?=\s|")/g) ?? []).toEqual([]);
  });
});

describe('lib/styles/components/base-card.tsx', () => {
  const source = read('lib/styles/components/base-card.tsx');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });
});

describe('lib/styles/components/button-variants.ts', () => {
  const source = read('lib/styles/components/button-variants.ts');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });
});

describe('app/globals.css', () => {
  const css = read('app/globals.css');

  it('tints every shadow token with ink instead of pure black', () => {
    const shadowLines = css
      .split('\n')
      .filter((line) => /^\s*--shadow(-[a-z0-9]+)?:/.test(line));
    expect(shadowLines.length).toBeGreaterThanOrEqual(8);
    expect(shadowLines.filter((line) => /hsl\(0 0% 0%/.test(line))).toEqual([]);
  });

  it('caps elevation at --shadow-lg', () => {
    expect(css).toMatch(/--shadow-xl:\s*var\(--shadow-lg\)/);
    expect(css).toMatch(/--shadow-2xl:\s*var\(--shadow-lg\)/);
  });

  it('keeps rounded-xl inside the 0–2 px radius rule', () => {
    expect(css).toMatch(/--radius-xl:\s*var\(--radius\)/);
  });

  it('declares the editorial motion tokens', () => {
    expect(css).toMatch(/--default-transition-duration:\s*180ms/);
    expect(css).toMatch(/--ease-out-editorial:/);
  });

  it('no longer ships the glass page background or shimmer keyframes', () => {
    expect(css).not.toMatch(/glass-page-background/);
    expect(css).not.toMatch(/@keyframes (shimmer-slide|text-shimmer)/);
    expect(css).not.toMatch(/animate-(shimmer-slide|text-shimmer)/);
  });
});

/**
 * The ratchet's `hue` pattern omits `red` and `yellow` (see HUES in
 * scripts/assert-no-banned-classes.js), so tinted status blocks in those two
 * families slip past it. Pin the surfaces that have been migrated off them.
 */
describe('legacy red/yellow status tints', () => {
  const TINT = /\b(bg|text|border|from|to|via|ring)-(red|yellow)-\d/;

  it.each([
    'app/settings/page.tsx',
    'components/SaveSearchDialog.tsx',
    'components/ChunkErrorBoundary.tsx',
  ])('%s uses editorial tones instead', (file) => {
    expect(read(file)).not.toMatch(TINT);
  });
});

/** Emoji used as icons (#641 misc) — lucide glyphs or nothing. */
describe('emoji-free files', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  it.each(['components/ChunkErrorBoundary.tsx'])('%s uses no emoji as icons', (file) => {
    expect(read(file)).not.toMatch(EMOJI);
  });
});

/** #641 asks for the admin figures to render through the <Stat> primitive. */
describe('app/admin/page.tsx', () => {
  it('renders its figures with <Stat> rather than hand-rolled numerals', () => {
    const source = read('app/admin/page.tsx');
    expect(source).not.toMatch(/text-3xl font-semibold/);
    expect(source).toMatch(/<Stat\b/);
  });
});
