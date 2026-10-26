// UC-15 (ADR-031): the reply language reaches the answer prompts that take it (v2),
// and active v1 prompts keep rendering exactly as before.
import type { State } from '../../src/ai/graph/state';
import { languageVariable } from '../../src/ai/nodes/promptFormat';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import { loadConfig } from '../../src/config';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const v1 = loadPromptRegistry(config.prompts.active);
const v2 = loadPromptRegistry({
  ...config.prompts.active,
  grounded_answer: 2,
  clarifying_question: 2,
  payroll_explain: 2,
});
const state = (text: string, replyLanguage?: 'auto' | 'en' | 'hi') =>
  ({
    input: { text },
    profile: {
      country: 'US',
      employmentType: 'full_time',
      accessLevel: 'standard',
      department: 'Engineering',
      jobTitle: 'Engineer',
      ...(replyLanguage && { replyLanguage }),
    },
  }) as unknown as Pick<State, 'profile' | 'input'>;

describe('languageVariable', () => {
  it('adds nothing for the active v1 prompts (which take no language)', () => {
    for (const name of ['grounded_answer', 'clarifying_question', 'payroll_explain'] as const) {
      expect(languageVariable(v1, name, state('मुझे कितनी छुट्टियाँ मिलती हैं?'))).toEqual({});
    }
  });

  it('gives the v2 prompts the language code decided', () => {
    expect(
      languageVariable(v2, 'grounded_answer', state('मुझे कितनी छुट्टियाँ मिलती हैं?')),
    ).toEqual({ language: 'Hindi (Devanagari script)' });
    expect(languageVariable(v2, 'grounded_answer', state('How much leave do I get?'))).toEqual({
      language: 'English',
    });
    expect(languageVariable(v2, 'payroll_explain', state('Why was my pay cut?', 'hi'))).toEqual({
      language: 'Hindi (Devanagari script)',
    });
  });
});

describe('answer prompts v2', () => {
  it('render with the v1 variables plus language, and state the language rule', async () => {
    const vars = {
      grounded_answer: { mode: 'answer', profile: 'p', question: 'q', sources: 's' },
      clarifying_question: { mode: 'ambiguity', profile: 'p', question: 'q', needed: 'n' },
      payroll_explain: { records: 'r', question: 'q', sources: 's' },
    } as const;
    for (const [name, base] of Object.entries(vars)) {
      const prompt = v2.get(name as keyof typeof vars);
      expect(prompt.version).toBe(2);
      expect(prompt.variables).toEqual([...Object.keys(base), 'language'].sort());
      const { messages } = await v2.render(name as keyof typeof vars, {
        ...base,
        language: 'Hindi (Devanagari script)',
      });
      expect(String(messages[0]!.content)).toContain('Hindi (Devanagari script)');
    }
  });

  it('keep citations and figures as the sources write them', async () => {
    const { messages } = await v2.render('grounded_answer', {
      mode: 'answer',
      profile: 'p',
      question: 'q',
      sources: 's',
      language: 'Hindi (Devanagari script)',
    });
    expect(String(messages[0]!.content)).toContain(
      'Keep source markers ([S1]), numbers, dates, amounts',
    );
  });
});
