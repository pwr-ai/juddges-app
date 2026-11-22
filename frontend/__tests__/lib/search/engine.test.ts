/**
 * Engine resolution for `/search` (#867): full corpus by default for a
 * signed-in user, curated for guests and for curated-only search state.
 */
import {
  curatedOnlyReasons,
  curatedOnlyStateFromUrl,
  parseEngineParam,
  resolveEngine,
  type CuratedOnlyState,
} from '@/lib/search/engine';
import { parseFullJudgmentId } from '@/lib/search/full-judgment-id';

const PLAIN: CuratedOnlyState = {
  selectedLanguages: ['uk', 'pl'],
  jurisdictions: [],
  baseFilters: {},
  customMetadata: {},
};

describe('parseEngineParam', () => {
  it.each([
    ['full', 'full'],
    ['curated', 'curated'],
    ['v2', 'full'],
    ['standard', 'curated'],
    ['bogus', null],
    [null, null],
  ])('%s -> %s', (value, expected) => {
    expect(parseEngineParam(value)).toBe(expected);
  });
});

describe('curatedOnlyReasons', () => {
  it('is empty for the default state (PL + UK languages, no filters)', () => {
    expect(curatedOnlyReasons(PLAIN)).toEqual([]);
  });

  it('flags a UK/EN-only language selection, a UK jurisdiction and extraction filters', () => {
    expect(
      curatedOnlyReasons({
        selectedLanguages: ['uk'],
        jurisdictions: ['UK'],
        baseFilters: { appeal_outcome: { kind: 'tag_array', values: ['dismissed'] } },
        customMetadata: { court: ['x'] },
      })
    ).toEqual([
      'orzeczenia UK/EN',
      'jurysdykcja UK',
      'filtry pól ekstrakcji',
      'filtry metadanych',
    ]);
  });

  it('ignores a PL-only jurisdiction and unset extraction filters', () => {
    expect(
      curatedOnlyReasons({ ...PLAIN, jurisdictions: ['PL'], baseFilters: { x: undefined } })
    ).toEqual([]);
  });
});

describe('resolveEngine', () => {
  it('defaults a signed-in user to the full corpus', () => {
    expect(resolveEngine({ signedIn: true, explicit: null, reasons: [] })).toBe('full');
  });

  it('gives guests the curated engine, whatever the URL says', () => {
    expect(resolveEngine({ signedIn: false, explicit: 'full', reasons: [] })).toBe('curated');
  });

  it('honours an explicit choice over curated-only reasons', () => {
    expect(resolveEngine({ signedIn: true, explicit: 'full', reasons: ['x'] })).toBe('full');
    expect(resolveEngine({ signedIn: true, explicit: 'curated', reasons: [] })).toBe('curated');
  });

  it('falls back to curated when the state needs it', () => {
    expect(resolveEngine({ signedIn: true, explicit: null, reasons: ['x'] })).toBe('curated');
  });
});

describe('curatedOnlyStateFromUrl', () => {
  it('lets URL params win over the stored state', () => {
    const state = curatedOnlyStateFromUrl(
      new URLSearchParams('lang=uk&extracted={"a":["b"]}'),
      PLAIN
    );
    expect(curatedOnlyReasons(state)).toEqual(['orzeczenia UK/EN', 'filtry pól ekstrakcji']);
  });

  it('keeps the stored state when the URL has no such params', () => {
    expect(curatedOnlyStateFromUrl(new URLSearchParams('q=zachowek'), PLAIN)).toEqual(PLAIN);
  });

  it('ignores malformed JSON params', () => {
    const state = curatedOnlyStateFromUrl(new URLSearchParams('extracted={bad'), PLAIN);
    expect(curatedOnlyReasons(state)).toEqual([]);
  });
});

describe('parseFullJudgmentId', () => {
  it('accepts pl-court ids and (encoded) NSA path ids', () => {
    expect(parseFullJudgmentId('151500000001006_II_AKa_000145_2013_Uz_2013-05-14_001')).toBe(
      '151500000001006_II_AKa_000145_2013_Uz_2013-05-14_001'
    );
    expect(parseFullJudgmentId('%2Fdoc%2F39FBE5DB09')).toBe('/doc/39FBE5DB09');
    expect(parseFullJudgmentId('/doc/39FBE5DB09')).toBe('/doc/39FBE5DB09');
  });

  it('rejects anything else', () => {
    expect(parseFullJudgmentId('a b')).toBeNull();
    expect(parseFullJudgmentId('%E0%A4%A')).toBeNull();
    expect(parseFullJudgmentId('x'.repeat(256))).toBeNull();
    expect(parseFullJudgmentId('<script>')).toBeNull();
  });
});
