// Tests for the standalone-HTML wrapper used by /api/documents/[id]/html.
//
// We import directly from `@/lib/parsing/html-builder` (rather than the
// `@/lib/parsing` barrel) so this suite stays decoupled from the JSDOM-based
// XML/HTML processors in the same package, which Jest's CJS transform cannot
// load alongside their ESM-only dependencies.

import { buildDocumentHtml } from '@/lib/parsing/html-builder';

describe('buildDocumentHtml', () => {
  it('wraps content in a doc-container with the given title', () => {
    const out = buildDocumentHtml('<p>x</p>', 'My Doc');
    expect(out).toContain('<!doctype html>');
    expect(out).toContain('<title>My Doc</title>');
    expect(out).toContain('class="doc-container"');
    expect(out).toContain('<p>x</p>');
  });

  it('defaults the title when none is provided', () => {
    const out = buildDocumentHtml('<p>x</p>');
    expect(out).toContain('<title>Document</title>');
  });

  it('escapes special characters in the title to prevent injection', () => {
    const out = buildDocumentHtml('content', '<script>x</script>');
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('converts plain-text content into <p> blocks split on blank lines', () => {
    const out = buildDocumentHtml('hello\n\nworld', 'T');
    expect(out).toContain('<p>hello</p>');
    expect(out).toContain('<p>world</p>');
  });

  // Regression guard for the width leak: the previous buildDocumentHtml emitted
  // `body { max-width: 800px; margin: 0 auto; padding: 2rem }`, which leaked
  // through SanitizedHtmlView's unscoped <style> tag and clamped the host page
  // to ~800px wide on /documents/[id]. Block any future re-introduction.
  it('does not constrain body width in the embedded stylesheet', () => {
    const out = buildDocumentHtml('<p>x</p>', 'My Doc');
    expect(out).not.toMatch(/body\s*\{[^}]*max-width\s*:\s*\d+px/);
    expect(out).not.toMatch(/body\s*\{[^}]*margin\s*:\s*0\s+auto/);
  });
});
