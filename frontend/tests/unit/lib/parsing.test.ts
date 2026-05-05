import {
  convertXmlTagsToHtml,
  fixHtmlContentServer,
  buildDocumentHtml,
} from '@/lib/parsing';

describe('convertXmlTagsToHtml', () => {
  it('converts paragraph tags to p tags', () => {
    expect(convertXmlTagsToHtml('<paragraph>hi</paragraph>')).toBe('<p>hi</p>');
  });

  it('converts heading, emphasis, strong_emphasis, and list tags', () => {
    const input =
      '<heading>Title</heading><emphasis>x</emphasis><strong_emphasis>y</strong_emphasis><ordered_list><list_item>1</list_item></ordered_list><unordered_list><list_item>a</list_item></unordered_list>';
    const expected =
      '<h3>Title</h3><em>x</em><strong>y</strong><ol><li>1</li></ol><ul><li>a</li></ul>';
    expect(convertXmlTagsToHtml(input)).toBe(expected);
  });

  it('returns empty string for empty/null/undefined input', () => {
    expect(convertXmlTagsToHtml('')).toBe('');
    // @ts-expect-error testing runtime guard
    expect(convertXmlTagsToHtml(null)).toBe('');
    // @ts-expect-error testing runtime guard
    expect(convertXmlTagsToHtml(undefined)).toBe('');
  });

  it('is case-insensitive on tag names', () => {
    expect(convertXmlTagsToHtml('<PARAGRAPH>X</PARAGRAPH>')).toBe('<p>X</p>');
  });

  it('leaves unrelated tags untouched', () => {
    expect(convertXmlTagsToHtml('<div>x</div>')).toBe('<div>x</div>');
  });

  it('handles special characters inside tags', () => {
    expect(convertXmlTagsToHtml('<paragraph>&amp; <></paragraph>')).toBe(
      '<p>&amp; <></p>'
    );
  });
});

describe('fixHtmlContentServer', () => {
  it('returns empty string for empty input', () => {
    expect(fixHtmlContentServer('')).toBe('');
  });

  it('replaces double newlines with paragraph breaks', () => {
    expect(fixHtmlContentServer('a\n\nb')).toBe('a</p><p>b');
  });

  it('removes empty paragraph tags', () => {
    expect(fixHtmlContentServer('<p></p><p>x</p>')).toBe('<p>x</p>');
  });

  it('self-closes void elements like br/hr/img/input', () => {
    const result = fixHtmlContentServer('<br><hr><img src="x"><input name="y">');
    expect(result).toContain('<br />');
    expect(result).toContain('<hr />');
    expect(result).toContain('<img src="x" />');
    expect(result).toContain('<input name="y" />');
  });

  it('does not double-close already self-closed tags', () => {
    const result = fixHtmlContentServer('<br />');
    expect(result).toBe('<br />');
  });
});

describe('buildDocumentHtml', () => {
  it('wraps content in a full HTML document by default', () => {
    const result = buildDocumentHtml('<paragraph>x</paragraph>');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('<body>');
    expect(result).toContain('<p>x</p>');
  });

  it('returns processed content only when wrapInBody is false', () => {
    const result = buildDocumentHtml('<paragraph>x</paragraph>', { wrapInBody: false });
    expect(result).not.toContain('<!DOCTYPE html>');
    expect(result).toContain('<p>x</p>');
  });

  it('includes title when provided', () => {
    const result = buildDocumentHtml('content', { title: 'My Doc' });
    expect(result).toContain('<title>My Doc</title>');
  });

  it('omits title element when not provided', () => {
    const result = buildDocumentHtml('content');
    expect(result).not.toContain('<title>');
  });

  it('appends custom styles when provided', () => {
    const result = buildDocumentHtml('content', { styles: '.custom { color: red; }' });
    expect(result).toContain('.custom { color: red; }');
  });

  it('handles empty content', () => {
    const result = buildDocumentHtml('');
    expect(result).toContain('<body>');
  });
});
