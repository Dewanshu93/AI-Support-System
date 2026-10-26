import { replyLanguageFor } from './language';

describe('replyLanguageFor', () => {
  it('follows an explicit setting whatever the script', () => {
    expect(replyLanguageFor('hi', 'How many days of annual leave do I get?')).toBe('hi');
    expect(replyLanguageFor('en', 'मुझे कितनी छुट्टियाँ मिलती हैं?')).toBe('en');
  });

  it('on auto (or no setting) answers in Hindi only for a Devanagari message', () => {
    expect(replyLanguageFor('auto', 'मुझे कितनी छुट्टियाँ मिलती हैं?')).toBe('hi');
    expect(replyLanguageFor(undefined, 'मेरी VPN काम नहीं कर रही')).toBe('hi');
    expect(replyLanguageFor('auto', 'How many days of annual leave do I get?')).toBe('en');
    // Romanised Hindi is not detected: the employee can choose Hindi in the setting.
    expect(replyLanguageFor('auto', 'mujhe kitni chhutti milti hai')).toBe('en');
  });
});
