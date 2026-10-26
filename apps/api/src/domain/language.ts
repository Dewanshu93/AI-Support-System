// Reply language (UC-15, ADR-031): code decides, from the employee's setting and,
// on "auto", the script of their message. Pure. Model-written answers follow it;
// code-written replies, citations and fixed texts stay in English for now.
import type { ReplyLanguage, ReplyLanguageSetting } from '@sd/shared';

/** Any Devanagari letter (Hindi is written in it). */
const DEVANAGARI = /[ऀ-ॿ]/;

/** The language the model should answer in for this message. */
export function replyLanguageFor(
  setting: ReplyLanguageSetting | undefined,
  message: string,
): ReplyLanguage {
  if (setting === 'en' || setting === 'hi') return setting;
  return DEVANAGARI.test(message) ? 'hi' : 'en';
}

/** How the prompt names the language (P-3 / P-4 / P-11 v2 `{{language}}`). */
export const LANGUAGE_NAME: Record<ReplyLanguage, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
};
