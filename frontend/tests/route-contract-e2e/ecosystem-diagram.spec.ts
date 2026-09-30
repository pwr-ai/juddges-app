import { expect, test } from '@playwright/test';

/**
 * /ecosystem mermaid diagram (#747), route-contract coverage.
 *
 * The page is public and static; the diagram is rendered client-side by
 * mermaid and then re-sanitised before insertion. This pins the one thing a
 * reader notices: multi-line labels keep their line break instead of gluing
 * the words on either side of it together ("Polishcourt judgments").
 */

test.describe('ecosystem diagram contract', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('renders multi-line node labels with their line breaks intact', async ({ page }) => {
    await page.goto('/ecosystem');

    const diagram = page.getByRole('img', { name: /JuDDGES ecosystem data flow/ });
    await expect(diagram.locator('svg .node')).toHaveCount(8);

    const labels = diagram.locator('svg .node foreignObject');
    await expect(labels.first()).toBeAttached();

    // innerText (not textContent) so a <br> shows up as a newline; it lives on
    // the HTML <div> inside the foreignObject, not on the SVG element itself.
    const texts = await labels.evaluateAll((nodes) =>
      nodes.map((node) => (node.firstElementChild as HTMLElement | null)?.innerText.trim() ?? ''),
    );

    expect(texts).toContain('Polish\ncourt judgments');
    expect(texts).toContain('England & Wales\ncourt judgments');
    expect(texts).toContain('Researchers\n& legal pros');
    expect(texts.join('\n')).not.toMatch(/Polishcourt|Walescourt|Researchers&/);
  });
});
