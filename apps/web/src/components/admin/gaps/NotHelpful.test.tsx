import type { AdminFeedback } from '@sd/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackReason } from '@/components/chat/ChatParts';
import { draftGoldenCase, FeedbackRow } from './NotHelpful';

const ITEM: AdminFeedback = {
  id: 'a'.repeat(24),
  rating: 'down',
  comment: 'Wrong or out of date: the allowance changed',
  createdAt: '2026-10-11T09:00:00.000Z',
  conversationId: 'b'.repeat(24),
  traceId: 'c'.repeat(24),
  question: 'What is the daily meal allowance?',
  answerExcerpt: 'The daily meal allowance is $50.',
  decision: 'ANSWER',
  reasonCode: 'EVIDENCE_STRONG',
  profile: { country: 'US', employmentType: 'full_time' },
  userEmail: 'priya.shah@example.com',
};

describe('draftGoldenCase', () => {
  it('builds a golden-set line from the redacted question and profile, with placeholders to decide', () => {
    const line = JSON.parse(draftGoldenCase(ITEM));
    expect(line).toMatchObject({
      id: 'HR-ANS-XXX',
      userEmail: 'priya.shah@example.com',
      turns: [{ role: 'user', content: 'What is the daily meal allowance?' }],
      expected: { decision: 'ANSWER', docSlugs: [], forbiddenDocSlugs: [], keyFacts: [] },
    });
    expect(line.notes).toContain('Wrong or out of date: the allowance changed');
    expect(line.notes).toContain('was ANSWER EVIDENCE_STRONG');
  });
});

describe('FeedbackRow', () => {
  it('shows the question, reason, decision, profile, trace link and the copy action', () => {
    const html = renderToStaticMarkup(<FeedbackRow item={ITEM} />);
    expect(html).toContain('What is the daily meal allowance?');
    expect(html).toContain('the allowance changed');
    expect(html).toContain('ANSWER');
    expect(html).toContain('US · Full-time');
    expect(html).toContain(`/admin/traces/${'b'.repeat(24)}`);
    expect(html).toContain('Copy as golden case');
  });

  it('hides the copy action when the question is confidential', () => {
    const html = renderToStaticMarkup(
      <FeedbackRow item={{ ...ITEM, question: null, answerExcerpt: null }} />,
    );
    expect(html).toContain('(confidential or not traced)');
    expect(html).not.toContain('Copy as golden case');
  });
});

describe('FeedbackReason (chat)', () => {
  it('offers the quick reasons and a note; Send waits for a reason or note', () => {
    const html = renderToStaticMarkup(<FeedbackReason onSend={async () => undefined} />);
    expect(html).toContain('What was wrong?');
    expect(html).toContain('Did not answer my question');
    expect(html).toContain('data-testid="feedback-note"');
    expect(html).toMatch(/data-testid="feedback-send"[^>]*disabled=""/);
  });
});
