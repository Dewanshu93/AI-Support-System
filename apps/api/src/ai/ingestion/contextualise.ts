/**
 * Step 5: `<title> > <section path>\n<text>`. This is what is embedded and
 * BM25-indexed; it helps short sections such as "Eligibility" match.
 */
export function contextualise(title: string, sectionPath: string[], text: string): string {
  return `${[title, ...sectionPath].join(' > ')}\n${text}`;
}
