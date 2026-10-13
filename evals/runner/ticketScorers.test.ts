import { fieldMatches, normaliseField, scoreTicket } from './ticketScorers';

describe('normaliseField', () => {
  it('lowercases, trims, drops punctuation and stop words, applies synonyms', () => {
    expect(normaliseField('  My Dell Notebook!  ')).toBe('dell laptop');
    expect(normaliseField('Annual-leave')).toBe('leave');
    expect(normaliseField('2FA codes')).toBe('multi factor authentication codes');
    expect(normaliseField('Working from home')).toBe('work from home');
  });
});

describe('fieldMatches', () => {
  it.each([
    ['Dell Latitude 7440', 'dell latitude 7440', true],
    ['My laptop is a Dell Latitude 7440', 'Dell Latitude 7440', true], // contains
    ['notebook', 'laptop', true], // synonym
    ['home office equipment allowance', 'whether a home office equipment allowance exists', true],
    ['ThinkPad T14', 'Dell Latitude 7440', false],
    ['unknown', 'Dell Latitude 7440', false],
  ])('%s ~ %s → %s', (actual, expected, match) => {
    expect(fieldMatches(actual, expected)).toBe(match);
  });
});

describe('scoreTicket', () => {
  const expected = {
    category: 'hardware',
    minPriority: 'critical' as const,
    fields: {
      device_model: 'Dell Latitude 7440',
      symptoms: 'battery swollen',
      asset_tag: 'unknown',
    },
  };
  const required = ['device_model', 'symptoms'];

  it('a correct draft: category, required fields, no invented values, floor met', () => {
    const s = scoreTicket(
      expected,
      {
        category: 'hardware',
        subcategory: 'battery',
        priority: 'critical',
        fields: {
          device_model: 'Dell Latitude 7440 laptop',
          symptoms: 'the battery is swollen',
          asset_tag: 'unknown',
        },
      },
      { requiredFields: required, safety: true },
    );
    expect(s).toEqual({
      categoryCorrect: true,
      fieldsChecked: 2,
      fieldsMatched: 2,
      mismatched: [],
      invented: [],
      floorMet: true,
    });
  });

  it('flags a wrong field, an invented value and a missed priority floor', () => {
    const s = scoreTicket(
      expected,
      {
        category: 'software',
        subcategory: null,
        priority: 'high',
        fields: { device_model: 'ThinkPad T14', symptoms: 'battery swollen', asset_tag: 'AT-1234' },
      },
      { requiredFields: required, safety: true },
    );
    expect(s).toMatchObject({
      categoryCorrect: false,
      fieldsMatched: 1,
      mismatched: ['device_model'],
      invented: ['asset_tag'],
      floorMet: false,
    });
  });

  it('only required fields with a known expected value are checked; floor only for safety', () => {
    const s = scoreTicket(
      expected,
      { category: 'hardware', subcategory: null, priority: 'low', fields: {} },
      { requiredFields: ['device_model', 'asset_tag'], safety: false },
    );
    expect(s.fieldsChecked).toBe(1); // asset_tag is expected "unknown"
    expect(s.floorMet).toBeNull();
  });

  it('no draft: every checked field counts as missed', () => {
    expect(scoreTicket(expected, null, { requiredFields: required, safety: true })).toMatchObject({
      categoryCorrect: false,
      fieldsMatched: 0,
      mismatched: required,
      floorMet: false,
    });
  });
});
