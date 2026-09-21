import {
  STATUS_TONE,
  getStatusTone,
  STATUS_TONE_STYLES,
  StatusTone,
} from '@/lib/styles/status-tone';

describe('status-tone semantic map', () => {
  describe('getStatusTone', () => {
    it('returns ink for standard success/active states', () => {
      expect(getStatusTone('ok')).toBe('ink');
      expect(getStatusTone('active')).toBe('ink');
      expect(getStatusTone('completed')).toBe('ink');
      expect(getStatusTone('success')).toBe('ink');
      expect(getStatusTone('healthy')).toBe('ink');
      expect(getStatusTone('published')).toBe('ink');
      expect(getStatusTone('verified')).toBe('ink');
    });

    it('returns gold for warning/pending/in-progress states', () => {
      expect(getStatusTone('warn')).toBe('gold');
      expect(getStatusTone('warning')).toBe('gold');
      expect(getStatusTone('pending')).toBe('gold');
      expect(getStatusTone('processing')).toBe('gold');
      expect(getStatusTone('in_progress')).toBe('gold');
      expect(getStatusTone('queued')).toBe('gold');
      expect(getStatusTone('draft')).toBe('gold');
      expect(getStatusTone('review')).toBe('gold');
    });

    it('returns oxblood for error/failed/deleted states', () => {
      expect(getStatusTone('error')).toBe('oxblood');
      expect(getStatusTone('failed')).toBe('oxblood');
      expect(getStatusTone('unhealthy')).toBe('oxblood');
      expect(getStatusTone('deleted')).toBe('oxblood');
      expect(getStatusTone('cancelled')).toBe('oxblood');
      expect(getStatusTone('down')).toBe('oxblood');
    });

    it('handles normalization: uppercase, mixed case, and spaces', () => {
      expect(getStatusTone('ACTIVE')).toBe('ink');
      expect(getStatusTone('In Progress')).toBe('gold');
      expect(getStatusTone('FAILED')).toBe('oxblood');
    });

    it('returns ink fallback for empty, null, undefined, or unknown status', () => {
      expect(getStatusTone(null)).toBe('ink');
      expect(getStatusTone(undefined)).toBe('ink');
      expect(getStatusTone('')).toBe('ink');
      expect(getStatusTone('completely_unknown_state')).toBe('ink');
    });
  });

  describe('STATUS_TONE_STYLES', () => {
    const tones: StatusTone[] = ['ink', 'gold', 'oxblood'];

    it('defines styles for all StatusTone variants', () => {
      tones.forEach((tone) => {
        const style = STATUS_TONE_STYLES[tone];
        expect(style).toBeDefined();
        expect(style.text).toContain(`text-${tone}`);
        expect(style.dot).toContain(`bg-${tone}`);
        expect(style.border).toBe('border-rule');
      });
    });
  });

  describe('STATUS_TONE dictionary completeness', () => {
    it('contains valid StatusTone values only', () => {
      Object.entries(STATUS_TONE).forEach(([status, tone]) => {
        expect(['ink', 'gold', 'oxblood']).toContain(tone);
        expect(status).toBe(status.toLowerCase());
      });
    });
  });
});
