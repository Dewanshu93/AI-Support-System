import { REPLY_EXCERPT_LENGTH, replyNotice, statusNotice } from './requestNotifications';

const REQUEST = { humanId: 'HR-0004', summary: 'Loss of Pay deduction on the latest payslip' };

describe('statusNotice', () => {
  it.each([
    ['in_progress', 'HR-0004 is under review', 'Under review'],
    ['waiting_on_employee', 'HR-0004 needs your reply', 'Waiting for you'],
    ['resolved', 'HR-0004 resolved', 'Resolved'],
    ['closed', 'HR-0004 closed', 'Closed'],
  ] as const)('%s → "%s", employee stage "%s"', (status, title, stage) => {
    expect(statusNotice(REQUEST, status)).toEqual({
      title,
      body: `Loss of Pay deduction on the latest payslip · now ${stage}`,
    });
  });
});

describe('replyNotice', () => {
  it('names the request and shows the reply on one line', () => {
    expect(replyNotice(REQUEST, 'Thanks.\n\nWe have corrected it.')).toEqual({
      title: 'The team replied on HR-0004',
      body: 'Thanks. We have corrected it.',
    });
  });

  it('cuts a long reply on a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(60);
    const { body } = replyNotice(REQUEST, long);
    expect(body.length).toBeLessThanOrEqual(REPLY_EXCERPT_LENGTH + 1);
    expect(body.endsWith('word…')).toBe(true);
  });
});
