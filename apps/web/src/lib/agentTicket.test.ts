import { ageLabel, classificationChange } from './agentTicket';

const current = { category: 'hardware', subcategory: 'battery', priority: 'medium' as const };

describe('classificationChange', () => {
  it('nothing changed → null (no request)', () => {
    expect(classificationChange(current, { ...current })).toBeNull();
  });

  it('only the changed fields are sent', () => {
    expect(classificationChange(current, { ...current, priority: 'high' })).toEqual({
      priority: 'high',
    });
    expect(classificationChange(current, { ...current, subcategory: 'laptop_fault' })).toEqual({
      subcategory: 'laptop_fault',
    });
  });

  it('a new category always sends its subcategory, null included', () => {
    expect(
      classificationChange(current, { category: 'access', subcategory: null, priority: 'medium' }),
    ).toEqual({ category: 'access', subcategory: null });
    expect(
      classificationChange(current, {
        category: 'access',
        subcategory: 'password_reset',
        priority: 'critical',
      }),
    ).toEqual({ category: 'access', subcategory: 'password_reset', priority: 'critical' });
  });
});

describe('ageLabel', () => {
  it.each([
    [0, '0 min'],
    [59, '59 min'],
    [60, '1 h'],
    [60 * 24 - 1, '23 h'],
    [60 * 24 * 3, '3 d'],
  ])('%i → %s', (minutes, label) => {
    expect(ageLabel(minutes)).toBe(label);
  });
});
