import { connectPath, connectResultText, problemText } from './connectedApps';

describe('connectResultText', () => {
  it('explains each result of the sign-in, per tool', () => {
    expect(connectResultText('jira', 'connected')).toEqual({ tone: 'ok', text: 'Jira connected.' });
    expect(connectResultText('github', 'declined')?.text).toBe(
      'GitHub was not connected: access was not allowed.',
    );
    expect(connectResultText('jira', 'no_site')?.tone).toBe('warn');
    expect(connectResultText('github', 'failed')?.text).toMatch(/try again/i);
  });
  it('ignores a missing or unknown value', () => {
    expect(connectResultText('jira', null)).toBeNull();
    expect(connectResultText('jira', '<script>')).toBeNull();
  });
});

describe('problemText', () => {
  it('says why a connected tool shows nothing', () => {
    expect(problemText('jira', 'reconnect')).toMatch(/sign in again/);
    expect(problemText('github', 'unreachable')).toMatch(/GitHub could not be reached/);
    expect(problemText('jira', null)).toBeNull();
  });
});

describe('connectPath', () => {
  it('is the API connect route for the tool', () => {
    expect(connectPath('github')).toBe('/api/integrations/github/connect');
  });
});
