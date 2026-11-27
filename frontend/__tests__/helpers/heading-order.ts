/**
 * Heading-outline helper for page-level a11y tests (axe `heading-order`):
 * collects h1-h6 and `role="heading"` elements in DOM order and returns the
 * first place where the level rises by more than one.
 */
export interface HeadingJump {
  from: number;
  to: number;
  text: string;
}

export function headingLevels(root: ParentNode): Array<{ level: number; text: string }> {
  return Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[role="heading"]')).map(
    (el) => {
      const aria = el.getAttribute('aria-level');
      const level = aria ? Number(aria) : Number(el.tagName.charAt(1));
      return { level, text: (el.textContent ?? '').trim() };
    },
  );
}

export function firstHeadingJump(root: ParentNode, startLevel = 1): HeadingJump | null {
  let previous = startLevel;
  for (const { level, text } of headingLevels(root)) {
    if (level > previous + 1) return { from: previous, to: level, text };
    previous = level;
  }
  return null;
}
