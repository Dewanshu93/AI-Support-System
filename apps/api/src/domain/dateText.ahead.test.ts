// Future dates and ranges for leave (UC-11c); the timesheet default (looking back) is
// covered in dateText.test.ts and must not change.
import { resolveDateText, resolveRangeEnd } from './dateText';

const TODAY = '2026-10-07'; // Wednesday

describe('resolveDateText ahead (leave)', () => {
  it.each([
    ['tomorrow', '2026-10-08'],
    ['the day after tomorrow', '2026-10-09'],
    ['Friday', '2026-10-09'],
    ['on Monday', '2026-10-12'],
    ['Wednesday', '2026-10-07'], // today counts
    ['next Wednesday', '2026-10-14'],
    ['this coming Monday', '2026-10-12'],
    ['last Friday', '2026-10-02'], // "last" still looks back
    ['Oct 24', '2026-10-24'],
    ['24 October', '2026-10-24'],
  ])('%s → %s', (text, date) => {
    expect(resolveDateText(text, TODAY, { ahead: true })).toEqual({ date });
  });

  it('keeps looking back by default (timesheets)', () => {
    expect(resolveDateText('Friday', TODAY)).toEqual({ date: '2026-10-02' });
    expect(resolveDateText('Monday', TODAY)).toEqual({ date: '2026-10-05' });
    // Explicitly ahead words are read ahead either way.
    expect(resolveDateText('tomorrow', TODAY)).toEqual({ date: '2026-10-08' });
    expect(resolveDateText('next Monday', TODAY)).toEqual({ date: '2026-10-12' });
  });
});

describe('resolveRangeEnd', () => {
  it('reads a bare day in the start month ("Oct 24-25")', () => {
    expect(resolveRangeEnd('25', '2026-10-24', TODAY)).toEqual({ date: '2026-10-25' });
    expect(resolveRangeEnd('27th', '2026-10-24', TODAY)).toEqual({ date: '2026-10-27' });
    expect(resolveRangeEnd('31', '2026-11-02', TODAY)).toEqual({ error: 'invalid' });
  });

  it('reads a full date or a weekday like a start date', () => {
    expect(resolveRangeEnd('2 November', '2026-10-30', TODAY)).toEqual({ date: '2026-11-02' });
    expect(resolveRangeEnd('Friday', '2026-10-07', TODAY, { ahead: true })).toEqual({
      date: '2026-10-09',
    });
  });
});
