// The Copilot header's Pro switch (ADR-020), rendered to static HTML: loading,
// off, on, saving and a failed save. The click → PATCH flow is covered end to end.
import { renderToStaticMarkup } from 'react-dom/server';
import { PRO_HINT, ProModelsView } from './ProModelsSwitch';

const render = (on: boolean | null, extra: { saving?: boolean; failed?: boolean } = {}) =>
  renderToStaticMarkup(
    <ProModelsView
      on={on}
      saving={extra.saving ?? false}
      failed={extra.failed ?? false}
      hint={on ? PRO_HINT.on : PRO_HINT.off}
      onToggle={() => undefined}
    />,
  );

describe('ProModelsView', () => {
  it('is an accessible switch, off by default, explaining the local model', () => {
    const html = render(false);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(PRO_HINT.off);
    expect(html).not.toContain('disabled=""');
  });

  it('on: checked, explaining the paid models', () => {
    const html = render(true);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Gemini, OpenRouter');
  });

  it('is disabled until the setting has loaded and while saving', () => {
    expect(render(null)).toContain('disabled=""');
    expect(render(true, { saving: true })).toContain('disabled=""');
  });

  it('says when a save failed', () => {
    expect(render(false, { failed: true })).toContain('Could not save');
  });
});
