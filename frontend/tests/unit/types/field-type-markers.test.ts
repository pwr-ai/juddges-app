import { FIELD_TYPE_MARKERS, FieldType } from '@/types/schema-editor';
import { getFieldMarker } from '@/components/editorial/FieldTypeBadge';

describe('FIELD_TYPE_MARKERS exhaustiveness', () => {
  const allFieldTypes: FieldType[] = [
    'string',
    'number',
    'integer',
    'boolean',
    'array',
    'object',
    'null',
  ];

  it('defines markers for every FieldType enum variant', () => {
    allFieldTypes.forEach((type) => {
      const marker = FIELD_TYPE_MARKERS[type];
      expect(marker).toBeDefined();
      expect(marker.icon).toBeDefined();
      expect(typeof marker.label).toBe('string');
      expect(marker.label.length).toBeGreaterThan(0);
      expect(marker.label).toBe(marker.label.toUpperCase());
    });
  });

  describe('getFieldMarker', () => {
    it('resolves standard FieldType markers', () => {
      allFieldTypes.forEach((type) => {
        const marker = getFieldMarker(type);
        expect(marker).toEqual(FIELD_TYPE_MARKERS[type]);
      });
    });

    it('resolves extended types: date, datetime, enum, email, url, text, yes/no', () => {
      expect(getFieldMarker('date').label).toBe('DATE');
      expect(getFieldMarker('datetime').label).toBe('DATETIME');
      expect(getFieldMarker('time').label).toBe('TIME');
      expect(getFieldMarker('enum').label).toBe('ENUM');
      expect(getFieldMarker('email').label).toBe('EMAIL');
      expect(getFieldMarker('url').label).toBe('URL');
      expect(getFieldMarker('text').label).toBe('TEXT');
      expect(getFieldMarker('yes/no').label).toBe('BOOLEAN');
    });

    it('handles uppercase and trimmed input', () => {
      expect(getFieldMarker('STRING').label).toBe('STRING');
      expect(getFieldMarker(' date ').label).toBe('DATE');
    });

    it('falls back gracefully on empty, null, or custom types', () => {
      expect(getFieldMarker(null)).toEqual(FIELD_TYPE_MARKERS.string);
      expect(getFieldMarker(undefined)).toEqual(FIELD_TYPE_MARKERS.string);
      expect(getFieldMarker('custom_type').label).toBe('CUSTOM_TYPE');
    });
  });
});
