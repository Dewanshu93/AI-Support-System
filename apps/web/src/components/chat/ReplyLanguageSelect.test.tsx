import { renderToStaticMarkup } from 'react-dom/server';
import { ReplyLanguageView } from './ReplyLanguageSelect';

describe('ReplyLanguageView (UC-15)', () => {
  it('offers Auto, English and Hindi, with the saved value selected', () => {
    const html = renderToStaticMarkup(
      <ReplyLanguageView value="hi" failed={false} onChange={() => undefined} />,
    );
    expect(html).toContain('Reply in');
    expect(html).toMatch(/<option value="auto">Auto<\/option>/);
    expect(html).toMatch(/<option value="en">English<\/option>/);
    expect(html).toMatch(/<option value="hi" selected="">हिन्दी<\/option>/);
  });

  it('is disabled until loaded and says when saving failed', () => {
    expect(
      renderToStaticMarkup(
        <ReplyLanguageView value={null} failed={false} onChange={() => undefined} />,
      ),
    ).toContain('disabled=""');
    expect(
      renderToStaticMarkup(<ReplyLanguageView value="en" failed onChange={() => undefined} />),
    ).toContain('Could not save');
  });
});
