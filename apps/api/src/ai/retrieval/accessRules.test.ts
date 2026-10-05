import {
  ACCESS_LEVELS,
  COUNTRIES,
  type Country,
  DOCUMENT_STATUSES,
  EMPLOYMENT_TYPES,
  type EmploymentType,
} from '@sd/shared';
import { ObjectId } from 'mongodb';
import { assertAccessible, buildAccessFilter, type QdrantFilter } from './accessFilter';
import {
  accessDenial,
  type AccessProfile,
  allowedAccessLevels,
  type AudienceMeta,
  isAccessible,
} from './accessRules';

/** Every non-empty subset of a list. */
function subsets<T>(items: readonly T[]): T[][] {
  return Array.from({ length: 2 ** items.length - 1 }, (_, mask) =>
    items.filter((_, i) => (mask + 1) & (1 << i)),
  );
}

const profiles: AccessProfile[] = COUNTRIES.flatMap((country) =>
  EMPLOYMENT_TYPES.flatMap((employmentType) =>
    ACCESS_LEVELS.map((accessLevel) => ({ country, employmentType, accessLevel })),
  ),
);

const audiences: AudienceMeta[] = subsets<Country>(COUNTRIES).flatMap((countries) =>
  subsets<EmploymentType>(EMPLOYMENT_TYPES).flatMap((employmentTypes) =>
    ACCESS_LEVELS.flatMap((accessLevel) =>
      DOCUMENT_STATUSES.map((status) => ({
        countries,
        employmentTypes,
        accessLevel,
        status,
        domain: 'HR' as const,
      })),
    ),
  ),
);

/** The rule written independently of the implementation. */
function expected(meta: AudienceMeta, p: AccessProfile): boolean {
  return (
    meta.status === 'active' &&
    meta.countries.includes(p.country) &&
    meta.employmentTypes.includes(p.employmentType) &&
    (meta.accessLevel === 'standard' || p.accessLevel === 'manager')
  );
}

/** Evaluates a Qdrant filter like Qdrant does: array fields match if any element matches. */
function matchesFilter(payload: AudienceMeta, filter: QdrantFilter): boolean {
  return filter.must.every(({ key, match }) => {
    const raw = (payload as unknown as Record<string, unknown>)[key];
    const values = (Array.isArray(raw) ? raw : [raw]) as string[];
    return 'value' in match
      ? values.includes(match.value)
      : values.some((v) => match.any.includes(v));
  });
}

describe('access rules (exhaustive)', () => {
  it('covers every profile × audience combination', () => {
    expect(profiles).toHaveLength(8); // 2 countries × 2 employment types × 2 access levels
    expect(audiences).toHaveLength(54); // 3 country sets × 3 employment sets × 2 levels × 3 statuses
  });

  it.each(profiles.map((p) => [`${p.country}/${p.employmentType}/${p.accessLevel}`, p] as const))(
    '%s: isAccessible, pre-filter and post-check agree with the rule for all 54 audiences',
    (_name, profile) => {
      const filter = buildAccessFilter(profile);
      for (const meta of audiences) {
        const want = expected(meta, profile);
        const chunk = { ...meta, _id: new ObjectId() };
        expect({ meta, isAccessible: isAccessible(meta, profile) }).toEqual({
          meta,
          isAccessible: want,
        });
        expect({ meta, preFilter: matchesFilter(meta, filter) }).toEqual({ meta, preFilter: want });
        expect({ meta, postCheck: assertAccessible(chunk, profile) === null }).toEqual({
          meta,
          postCheck: want,
        });
      }
    },
  );

  it('never lets superseded or inactive documents through, for any profile', () => {
    for (const p of profiles) {
      for (const meta of audiences.filter((a) => a.status !== 'active')) {
        expect(accessDenial(meta, p)).toBe('status');
      }
    }
  });

  it('reports the first failing rule as the reason', () => {
    const tom: AccessProfile = {
      country: 'UK',
      employmentType: 'contractor',
      accessLevel: 'standard',
    };
    const base: AudienceMeta = {
      countries: ['UK'],
      employmentTypes: ['contractor'],
      accessLevel: 'standard',
      status: 'active',
      domain: 'IT',
    };
    expect(accessDenial(base, tom)).toBeNull();
    expect(accessDenial({ ...base, countries: ['US'] }, tom)).toBe('country');
    expect(accessDenial({ ...base, employmentTypes: ['full_time'] }, tom)).toBe('employment_type');
    expect(accessDenial({ ...base, accessLevel: 'manager' }, tom)).toBe('access_level');
    expect(accessDenial({ ...base, status: 'superseded', countries: ['US'] }, tom)).toBe('status');
  });

  it('lets managers read standard documents but not the reverse', () => {
    expect(allowedAccessLevels('manager')).toEqual(['standard', 'manager']);
    expect(allowedAccessLevels('standard')).toEqual(['standard']);
  });

  it('returns a violation with the chunk id and reason', () => {
    const id = new ObjectId();
    const tom: AccessProfile = {
      country: 'UK',
      employmentType: 'contractor',
      accessLevel: 'standard',
    };
    expect(
      assertAccessible(
        {
          _id: id,
          countries: ['US'],
          employmentTypes: ['contractor'],
          accessLevel: 'standard',
          status: 'active',
          domain: 'HR',
        },
        tom,
      ),
    ).toEqual({ chunkId: id.toHexString(), reason: 'country' });
  });
});

describe('buildAccessFilter', () => {
  it('builds the pre-filter, with an optional domain hint', () => {
    const priya: AccessProfile = {
      country: 'US',
      employmentType: 'full_time',
      accessLevel: 'standard',
    };
    expect(buildAccessFilter(priya)).toEqual({
      must: [
        { key: 'status', match: { value: 'active' } },
        { key: 'countries', match: { value: 'US' } },
        { key: 'employmentTypes', match: { value: 'full_time' } },
        { key: 'accessLevel', match: { any: ['standard'] } },
      ],
    });
    expect(buildAccessFilter(priya, { domain: 'IT' }).must.at(-1)).toEqual({
      key: 'domain',
      match: { value: 'IT' },
    });
  });
});
