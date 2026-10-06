// Fixed replies from config/templates.yaml (playbook section 6: not LLM
// prompts). Pure: fills {placeholders}; a missing value is a programming error.

export function fillTemplate(template: string, values: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`template placeholder {${key}} has no value`);
    return value;
  });
}
