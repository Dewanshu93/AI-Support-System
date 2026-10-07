import { resolveDateText } from './dateText';

// Wednesday 7 October 2026.
const TODAY = '2026-10-07';
const date = (text: string) => resolveDateText(text, TODAY);

describe('resolveDateText', () => {
  it.each([
    ['today', '2026-10-07'],
    ['yesterday', '2026-10-06'],
    ['the day before yesterday', '2026-10-05'],
    ['2026-09-11', '2026-09-11'],
    ['11 September', '2026-09-11'],
    ['September 11', '2026-09-11'],
    ['Sep 11, 2026', '2026-09-11'],
    ['11th of Sept', '2026-09-11'],
    ['on 2 Oct', '2026-10-02'],
    ['Monday', '2026-10-05'],
    ['on Wednesday', '2026-10-07'],
    ['last Wednesday', '2026-09-30'],
    ['last Friday', '2026-10-02'],
    ['Friday', '2026-10-02'],
    ['31 December 2025', '2025-12-31'],
  ])('%s → %s', (text, expected) => {
    expect(date(text)).toEqual({ date: expected });
  });

  it.each(['11/09', 'next week', 'soon', '', 'the 11th'])('"%s" is not recognised', (text) => {
    expect(date(text)).toEqual({ error: 'unrecognised' });
  });

  it('rejects impossible calendar dates', () => {
    expect(date('31 September')).toEqual({ error: 'invalid' });
    expect(date('2026-02-30')).toEqual({ error: 'invalid' });
  });

  it('keeps the current year for dates without one (validation rejects future dates)', () => {
    expect(date('9 October')).toEqual({ date: '2026-10-09' });
  });
});
