import { jiraResultText, trackerProblemText } from './JiraConnection';

describe('jiraResultText', () => {
  it('explains each result of the Atlassian sign-in', () => {
    expect(jiraResultText('connected')).toMatchObject({ tone: 'ok' });
    expect(jiraResultText('declined')?.text).toMatch(/not allowed/);
    expect(jiraResultText('no_site')?.text).toMatch(/no Jira site/);
    expect(jiraResultText('failed')?.tone).toBe('warn');
  });
  it('ignores a missing or unknown value', () => {
    expect(jiraResultText(null)).toBeNull();
    expect(jiraResultText('<script>')).toBeNull();
  });
});

describe('trackerProblemText', () => {
  it('says why Jira issues are missing', () => {
    expect(trackerProblemText({ source: 'jira', siteName: 'Acme', problem: 'reconnect' })).toMatch(
      /sign in again/,
    );
    expect(
      trackerProblemText({ source: 'jira', siteName: 'Acme', problem: 'unreachable' }),
    ).toMatch(/could not be reached/);
    expect(trackerProblemText({ source: 'mock', siteName: null, problem: null })).toBeNull();
  });
});
