import { loadConfig } from '../../config';
import { VALID_ENV } from '../../../test/helpers/config';
import { compilePrecheckRules } from './precheckRules';

const config = loadConfig(VALID_ENV);
const rules = compilePrecheckRules(config.sensitive, config.priorityRules);

describe('precheck rules (committed config)', () => {
  it.each([
    ['My manager keeps harassing me in meetings', 'harassment'],
    ['I am being bullied by a colleague', 'harassment'],
    ['I think I was discriminated against for promotion', 'discrimination'],
    ['I have a medical condition and need adjustments', 'medical'],
    ['Should I talk to a lawyer about my contract?', 'legal'],
    ['I want to raise a formal complaint', 'grievance'],
    ["I can't cope with my workload any more", 'wellbeing'],
    ['I feel burnt out', 'wellbeing'],
  ])('sensitive: %s → %s', (text, rule) => {
    const result = rules.run(text);
    expect(result.sensitiveHit).toBe(true);
    expect(result.matchedRules).toContain(rule);
  });

  it.each([
    ['My laptop battery is swollen and the case is bulging', 'safety_battery'],
    ['The battery gets really hot and smells', 'safety_battery'],
    ['There are sparks coming from the charger', 'safety_electrical'],
    ['The charger cable is melting', 'safety_electrical'],
  ])('safety: %s → %s', (text, rule) => {
    const result = rules.run(text);
    expect(result).toMatchObject({ safetyHit: true, sensitiveHit: false });
    expect(result.matchedRules).toContain(rule);
  });

  it.each([
    'How do I reset my VPN password?',
    'How many days of annual leave do UK employees get?',
    'My laptop battery drains quickly',
    'Can I expense a new monitor?',
    'I need access to the finance SharePoint',
  ])('ordinary request: %s → no hit', (text) => {
    expect(rules.run(text)).toEqual({ sensitiveHit: false, safetyHit: false, matchedRules: [] });
  });

  it('is case-insensitive and ignores line breaks inside a phrase', () => {
    expect(rules.run('HARASSMENT').sensitiveHit).toBe(true);
    expect(rules.run('I want to raise a formal\n  complaint').matchedRules).toEqual(['grievance']);
  });

  it('reports every matching rule, sensitive first', () => {
    const result = rules.run('I was harassed and the battery is swollen');
    expect(result).toMatchObject({ sensitiveHit: true, safetyHit: true });
    expect(result.matchedRules).toEqual(['harassment', 'safety_battery']);
  });
});

describe('compilePrecheckRules', () => {
  it('uses only safety-kind priority floors', () => {
    const custom = compilePrecheckRules(
      { version: 1, rules: [{ id: 'x', topic: 'legal', patterns: ['\\bzzz\\b'] }] },
      {
        version: 1,
        floors: [
          { id: 'imp', kind: 'impact', floor: 'high', impactScope: 'org' },
          { id: 'fire', kind: 'safety', floor: 'critical', patterns: ['\\bfire\\b'] },
        ],
      },
    );
    expect(custom.run('fire in the office').matchedRules).toEqual(['fire']);
    expect(custom.run('everyone is affected').matchedRules).toEqual([]);
  });
});
