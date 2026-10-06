import { redactPII } from './redaction';

describe('redactPII', () => {
  it.each([
    ['email', 'Mail me at priya.shah@example.com please', 'Mail me at [EMAIL] please'],
    ['US SSN', 'My SSN is 123-45-6789.', 'My SSN is [SSN].'],
    ['UK NI number', 'NI number AB 12 34 56 C attached', 'NI number [NI_NUMBER] attached'],
    ['UK NI compact', 'ni AB123456D', 'ni [NI_NUMBER]'],
    ['card', 'Card 4111 1111 1111 1111 was charged', 'Card [CARD] was charged'],
    ['card dashes', 'card 5500-0000-0000-0004', 'card [CARD]'],
    ['UK phone', 'Call +44 20 7946 0958 today', 'Call [PHONE] today'],
    ['US phone', 'call (555) 123-4567', 'call [PHONE]'],
    ['employee ID', 'My employee number is 004512398', 'My employee number is [ID]'],
  ])('%s', (_label, input, expected) => {
    expect(redactPII(input)).toBe(expected);
  });

  it('keeps ordinary numbers, dates and policy facts', () => {
    const text =
      'I have 25 days of leave, 5 carried over, until 31 March 2026 (laptop model 7420).';
    expect(redactPII(text)).toBe(text);
  });

  it('redacts several identifiers in one message', () => {
    expect(redactPII('I am a.b@corp.co.uk, phone 07700 900123, SSN 123 45 6789')).toBe(
      'I am [EMAIL], phone [PHONE], SSN [SSN]',
    );
  });

  it('does not treat short number pairs as phone numbers', () => {
    expect(redactPII('Room 2026 7420 and ticket 12 34')).toBe('Room 2026 7420 and ticket 12 34');
  });

  it('is idempotent', () => {
    const once = redactPII('x@y.com 123-45-6789');
    expect(redactPII(once)).toBe(once);
  });
});
