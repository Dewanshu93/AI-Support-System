import { jiraPriority, jiraStatus, myIssuesJql, parseIssues, projectColour } from './jiraMapping';

const status = (name: string, key: string) => ({ name, statusCategory: { key } });

describe('jiraStatus', () => {
  it.each([
    [status('To Do', 'new'), 'todo'],
    [status('In Progress', 'indeterminate'), 'in_progress'],
    [status('Code Review', 'indeterminate'), 'in_review'],
    [status('Done', 'done'), 'done'],
    [status('Reviewed and closed', 'done'), 'done'],
    [null, 'todo'],
  ] as const)('%j → %s', (input, expected) => {
    expect(jiraStatus(input)).toBe(expected);
  });
});

describe('jiraPriority', () => {
  it.each([
    ['Highest', 'high'],
    ['High', 'high'],
    ['Medium', 'medium'],
    ['Low', 'low'],
    ['Lowest', 'low'],
    ['P2 - custom', 'medium'],
  ])('%s → %s', (name, expected) => {
    expect(jiraPriority({ name })).toBe(expected);
  });
  it('treats a missing priority as medium', () => expect(jiraPriority(null)).toBe('medium'));
});

describe('parseIssues', () => {
  const good = {
    id: '10001',
    key: 'PLAT-1',
    fields: {
      summary: 'Fix login',
      status: status('In Progress', 'indeterminate'),
      priority: { name: 'High' },
      duedate: '2026-10-09',
      project: { id: '100', key: 'PLAT', name: 'Platform' },
      updated: '2026-10-06T09:00:00.000+0000',
    },
  };

  it('maps an issue to a task with a link to its Jira page', () => {
    const [task] = parseIssues({ issues: [good] }, 'https://acme.atlassian.net/');
    expect(task).toEqual({
      id: '10001',
      key: 'PLAT-1',
      title: 'Fix login',
      status: 'in_progress',
      priority: 'high',
      project: { id: '100', code: 'PLAT', name: 'Platform', color: projectColour('PLAT') },
      dueDate: '2026-10-09',
      updatedAt: '2026-10-06T09:00:00.000Z',
      source: 'jira',
      url: 'https://acme.atlassian.net/browse/PLAT-1',
    });
  });

  it('skips an issue it cannot read and keeps the others', () => {
    const tasks = parseIssues({ issues: [{ id: 'x' }, good] }, 'https://acme.atlassian.net');
    expect(tasks.map((t) => t.key)).toEqual(['PLAT-1']);
  });

  it('gives no tasks for an unexpected body', () => {
    expect(parseIssues('nope', 'https://acme.atlassian.net')).toEqual([]);
  });
});

describe('myIssuesJql', () => {
  it('asks only for issues assigned to the signed-in user', () => {
    expect(myIssuesJql('open')).toBe(
      'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
    );
    expect(myIssuesJql('all')).toBe('assignee = currentUser() ORDER BY updated DESC');
  });
});
