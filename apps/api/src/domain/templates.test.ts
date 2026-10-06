import { loadConfig } from '../config';
import { VALID_ENV } from '../../test/helpers/config';
import { fillTemplate } from './templates';

describe('fillTemplate', () => {
  it('fills every placeholder', () => {
    expect(fillTemplate('Ticket {id} for {team}.', { id: 'IT-7', team: 'IT' })).toBe(
      'Ticket IT-7 for IT.',
    );
    expect(fillTemplate('No placeholders.')).toBe('No placeholders.');
  });

  it('throws on a placeholder without a value', () => {
    expect(() => fillTemplate('Raise a ticket with {domain}.')).toThrow('{domain}');
  });

  it('fills the committed withdrawn-answer template', () => {
    const { templates } = loadConfig(VALID_ENV).templates;
    expect(fillTemplate(templates.withdrawn_answer, { domain: 'HR' })).toContain('the HR team');
  });
});
