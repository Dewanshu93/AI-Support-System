// Prompt registry (playbook section 6). Prompts live in
// ai/prompts/<name>/v<N>.md: YAML frontmatter + "## System" and "## User"
// sections, mustache {{variables}}. The active version comes from
// config/prompts.yaml; every LLM call records `name@vN#hash` in its trace.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { load, YAMLException } from 'js-yaml';
import { z } from 'zod';
import { REPO_ROOT } from '../../config';
import { PROMPT_NAMES, type PromptName } from '../../config/schemas';
import { OUTPUT_SCHEMA_NAMES } from '../schemas';

/** Source directory (Markdown files are not compiled, so dist reads them from here too). */
export const PROMPTS_DIR = path.join(REPO_ROOT, 'apps', 'api', 'src', 'ai', 'prompts');

export class PromptError extends Error {
  override name = 'PromptError';
}

export const PromptFrontmatterSchema = z.strictObject({
  name: z.enum(PROMPT_NAMES),
  version: z.number().int().positive(),
  modelTier: z.enum(['fast', 'quality']),
  /** Name of a Zod schema in ai/schemas. */
  outputSchema: z.enum(OUTPUT_SCHEMA_NAMES),
  temperature: z.number().min(0).max(1),
  description: z.string().trim().min(1),
});
export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>;

export interface LoadedPrompt extends PromptFrontmatter {
  /** First 12 hex chars of SHA-256 over the whole file. */
  hash: string;
  /** Trace reference, e.g. `turn_analysis@v1#3f2a9c1b04de`. */
  ref: string;
  template: ChatPromptTemplate;
  variables: string[];
  file: string;
}

/**
 * Values are inserted into untrusted data sections. Remove any
 * <untrusted_*> / </untrusted_*> tags so data cannot close its own section.
 */
export function sanitizeValue(value: string): string {
  return value.replace(/<\/?\s*untrusted_[a-z_]*\s*>/gi, '');
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Parses and validates one prompt file. */
export function parsePromptFile(
  file: string,
  text: string,
  expected?: { name: string; version: number },
): LoadedPrompt {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new PromptError(`${file}: missing YAML frontmatter`);
  let data: unknown;
  try {
    data = load(match[1]!);
  } catch (err) {
    if (err instanceof YAMLException)
      throw new PromptError(`${file}: malformed frontmatter: ${err.reason}`);
    throw err;
  }
  const meta = PromptFrontmatterSchema.safeParse(data);
  if (!meta.success) {
    throw new PromptError(
      `${file}: invalid frontmatter: ${meta.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  if (expected && (meta.data.name !== expected.name || meta.data.version !== expected.version)) {
    throw new PromptError(
      `${file}: frontmatter says ${meta.data.name} v${meta.data.version}, expected ${expected.name} v${expected.version}`,
    );
  }

  const sections = new Map<string, string>();
  let current: string | undefined;
  const lines: string[] = [];
  const flush = () => {
    if (current) sections.set(current, lines.join('\n').trim());
    lines.length = 0;
  };
  for (const line of match[2]!.split(/\r?\n/)) {
    const heading = /^## (System|User)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1]!.toLowerCase();
    } else if (current) lines.push(line);
  }
  flush();
  const system = sections.get('system');
  const user = sections.get('user');
  if (!system || !user)
    throw new PromptError(`${file}: needs non-empty "## System" and "## User" sections`);

  const template = ChatPromptTemplate.fromMessages(
    [
      ['system', system],
      ['human', user],
    ],
    { templateFormat: 'mustache' },
  );
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return {
    ...meta.data,
    hash,
    ref: `${meta.data.name}@v${meta.data.version}#${hash}`,
    template,
    variables: [...template.inputVariables].sort(),
    file,
  };
}

export interface RenderedPrompt {
  prompt: LoadedPrompt;
  messages: BaseMessage[];
}

export interface PromptRegistry {
  get(name: PromptName): LoadedPrompt;
  /** Renders the active version; every template variable must be given, and no others. */
  render(name: PromptName, variables: Record<string, string>): Promise<RenderedPrompt>;
  /** Active prompts, for config snapshots and traces. */
  active(): Record<string, { version: number; hash: string; ref: string }>;
}

/**
 * Loads the active version of every prompt named in config/prompts.yaml.
 * A missing file, invalid frontmatter or name/version mismatch throws
 * PromptError, which stops startup.
 */
export function loadPromptRegistry(
  activeVersions: Partial<Record<PromptName, number>>,
  dir: string = PROMPTS_DIR,
): PromptRegistry {
  const prompts = new Map<PromptName, LoadedPrompt>();
  for (const [name, version] of Object.entries(activeVersions) as [PromptName, number][]) {
    const file = path.join(dir, name, `v${version}.md`);
    const shown = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      throw new PromptError(
        `config/prompts.yaml activates ${name} v${version}, but ${shown} does not exist`,
      );
    }
    prompts.set(name, parsePromptFile(shown, text, { name, version }));
  }

  const get = (name: PromptName): LoadedPrompt => {
    const prompt = prompts.get(name);
    if (!prompt) throw new PromptError(`prompt ${name} is not active in config/prompts.yaml`);
    return prompt;
  };

  return {
    get,
    async render(name, variables) {
      const prompt = get(name);
      const given = Object.keys(variables).sort();
      const missing = prompt.variables.filter((v) => !given.includes(v));
      const extra = given.filter((v) => !prompt.variables.includes(v));
      if (missing.length > 0 || extra.length > 0) {
        throw new PromptError(
          `${prompt.ref}: ${missing.length ? `missing variables ${missing.join(', ')}` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `unknown variables ${extra.join(', ')}` : ''}`,
        );
      }
      const clean = Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [k, sanitizeValue(v)]),
      );
      return { prompt, messages: await prompt.template.formatMessages(clean) };
    },
    active() {
      return Object.fromEntries(
        [...prompts.values()].map((p) => [
          p.name,
          { version: p.version, hash: p.hash, ref: p.ref },
        ]),
      );
    },
  };
}
