import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VALID_ENV } from '../../../test/helpers/config';
import { loadConfig } from '../../config';
import { findSeedProblems, loadSeedUsers, SEED_USERS_FILE } from './seed';

describe('seed/users.json', () => {
  const users = loadSeedUsers();
  const routing = loadConfig({ ...VALID_ENV }).routing;
  const by = (email: string) => users.find((u) => u.email === email);

  it('contains the eight personas from the W1-05 card', () => {
    expect(users).toHaveLength(8);
    expect(by('priya.shah@example.com')).toMatchObject({
      role: 'employee',
      country: 'US',
      employmentType: 'full_time',
    });
    expect(by('tom.clarke@example.com')).toMatchObject({
      country: 'UK',
      employmentType: 'contractor',
    });
    expect(by('olivia.bennett@example.com')).toMatchObject({
      country: 'UK',
      employmentType: 'full_time',
      accessLevel: 'manager',
    });
    expect(by('marcus.lee@example.com')).toMatchObject({
      country: 'US',
      employmentType: 'contractor',
    });
    expect(by('sam.patel@example.com')).toMatchObject({
      role: 'agent',
      queues: ['it_hardware', 'it_software', 'it_access'],
    });
    expect(by('hana.kim@example.com')).toMatchObject({
      role: 'agent',
      queues: ['hr_general', 'hr_case'],
    });
    expect(by('alex.morgan@example.com')).toMatchObject({ role: 'admin' });
    expect(users.every((u) => u.isDemo)).toBe(true);
  });

  it('covers every role, country, employment type and access level', () => {
    const values = (key: 'role' | 'country' | 'employmentType' | 'accessLevel') =>
      new Set(users.map((u) => u[key]));
    expect(values('role')).toEqual(new Set(['employee', 'agent', 'admin']));
    expect(values('country')).toEqual(new Set(['US', 'UK']));
    expect(values('employmentType')).toEqual(new Set(['full_time', 'contractor']));
    expect(values('accessLevel')).toEqual(new Set(['standard', 'manager']));
  });

  it('is consistent with config/routing.yaml', () => {
    expect(findSeedProblems(users, routing)).toEqual([]);
  });

  it('reports unknown queues and duplicate users', () => {
    const broken = [...users, { ...users[5]!, queues: ['it_nowhere'] }];
    expect(findSeedProblems(broken, routing)).toEqual(
      expect.arrayContaining([
        'duplicate email sam.patel@example.com',
        expect.stringMatching(/^duplicate _id /),
        'sam.patel@example.com: unknown queue "it_nowhere"',
      ]),
    );
  });

  it('rejects an invalid seed file and names the offending user', () => {
    const [first] = JSON.parse(fs.readFileSync(SEED_USERS_FILE, 'utf8')) as object[];
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-seed-')), 'users.json');
    // An agent with no queues violates the users schema.
    fs.writeFileSync(file, JSON.stringify([{ ...first, role: 'agent' }]));
    expect(() => loadSeedUsers(file)).toThrow(
      /user 0 \(priya\.shah@example\.com\) is invalid: queues/,
    );
  });
});
