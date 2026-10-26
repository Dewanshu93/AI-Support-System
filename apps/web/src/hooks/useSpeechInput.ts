'use client';

// Voice input for the copilot (UC-14, ADR-030): the browser's Web Speech API turns
// speech into text in the composer; the employee reviews it and still presses Send.
// No new dependency. Chrome and Edge send the audio to the browser vendor's speech
// service, so recognition starts only when the employee presses the mic button.
import { useCallback, useEffect, useRef, useState } from 'react';

/** The parts of SpeechRecognition used here (not in TypeScript's DOM lib everywhere). */
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
type RecognizerCtor = new () => Recognizer;

/** The browser's recognizer, or null where speech input is not supported (Firefox, Safari < 14.1). */
export function speechRecognizer(w: unknown = globalThis): RecognizerCtor | null {
  const g = w as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/** What the employee had typed, plus what was heard, with one space between. */
export function joinTranscript(before: string, heard: string): string {
  const spoken = heard.replace(/\s+/g, ' ').trim();
  if (!spoken) return before;
  return before.trim() ? `${before.trimEnd()} ${spoken}` : spoken;
}

/** Words for the recognizer's error codes. */
export function speechErrorText(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in the browser to use voice input.';
    case 'network':
      return 'The speech service cannot be reached from this network. Please type your message.';
    case 'no-speech':
      return 'No speech was heard. Try again, closer to the microphone.';
    case 'audio-capture':
      return 'No microphone was found.';
    default:
      return 'Voice input stopped. Please try again or type your message.';
  }
}

/**
 * Starts and stops dictation. `onText` receives the composer text so far plus what
 * was heard (interim results included), so the employee sees the words appear.
 */
export function useSpeechInput({
  lang = 'en-US',
  onText,
}: {
  lang?: string;
  onText: (heard: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizer = useRef<Recognizer | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // Detected after mount: the server render has no window.
  useEffect(() => setSupported(speechRecognizer(window) !== null), []);
  useEffect(() => () => recognizer.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = speechRecognizer(window);
    if (!Ctor || recognizer.current) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        if (result.isFinal) finalText += ` ${result[0].transcript}`;
        else interim += ` ${result[0].transcript}`;
      }
      onTextRef.current(`${finalText} ${interim}`);
    };
    r.onerror = (e) => {
      // "aborted" is our own stop().
      if (e.error !== 'aborted') setError(speechErrorText(e.error));
    };
    r.onend = () => {
      recognizer.current = null;
      setListening(false);
    };
    setError(null);
    recognizer.current = r;
    setListening(true);
    r.start();
  }, [lang]);

  const stop = useCallback(() => recognizer.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
