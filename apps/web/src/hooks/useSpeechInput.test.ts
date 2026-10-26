import { joinTranscript, speechErrorText, speechRecognizer } from './useSpeechInput';

describe('speechRecognizer', () => {
  it('finds the standard or the webkit-prefixed recognizer, else null', () => {
    class Standard {}
    class Webkit {}
    expect(speechRecognizer({ SpeechRecognition: Standard, webkitSpeechRecognition: Webkit })).toBe(
      Standard,
    );
    expect(speechRecognizer({ webkitSpeechRecognition: Webkit })).toBe(Webkit);
    expect(speechRecognizer({})).toBeNull();
  });
});

describe('joinTranscript', () => {
  it('appends what was heard to what was typed, with single spaces', () => {
    expect(joinTranscript('', '  log eight   hours ')).toBe('log eight hours');
    expect(joinTranscript('Please', ' log eight hours')).toBe('Please log eight hours');
    expect(joinTranscript('Please ', '')).toBe('Please ');
  });
});

describe('speechErrorText', () => {
  it.each([
    ['not-allowed', /Microphone access is blocked/],
    ['network', /cannot be reached from this network/],
    ['no-speech', /No speech was heard/],
    ['audio-capture', /No microphone/],
    ['something-else', /Voice input stopped/],
  ])('%s', (code, text) => {
    expect(speechErrorText(code)).toMatch(text);
  });
});
