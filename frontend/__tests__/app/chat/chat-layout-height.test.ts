/**
 * #699: chat surfaces must fill the layout column (flex/height chain from
 * AppLayoutWrapper) instead of subtracting only the navbar from the viewport,
 * which ignored CompactFooter and FlowStepper and pushed the composer below
 * the fold. The real geometry is asserted in the route-contract viewport spec;
 * this guards the class contract cheaply.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(__dirname, '../../..', rel), 'utf8');

const CHAT_SURFACES = [
  'app/chat/page.tsx',
  'app/chat/[id]/ChatDetailClient.tsx',
  'app/chat/error.tsx',
  'lib/styles/components/chat/chat-interface.tsx',
];

describe('chat layout height (#699)', () => {
  it.each(CHAT_SURFACES)('%s does not size itself with calc(100vh', (file) => {
    expect(read(file)).not.toContain('calc(100vh');
  });

  it.each([
    'app/chat/page.tsx',
    'app/chat/[id]/ChatDetailClient.tsx',
    'lib/styles/components/chat/chat-interface.tsx',
  ])('%s fills its parent with h-full', (file) => {
    expect(read(file)).toMatch(/flex flex-col h-full/);
  });

  it('AppLayoutWrapper gives <main> a definite flex-fill height', () => {
    const src = read('components/layouts/AppLayoutWrapper.tsx');
    expect(src).toMatch(/<main className="[^"]*\bflex-1\b[^"]*\bmin-h-0\b/);
    expect(src).toMatch(/flex-1 flex flex-col overflow-y-auto/);
  });
});
