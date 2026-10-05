// Who may read which chunk (playbook section 7). The single source of truth for
// both the search pre-filter (accessFilter.ts) and the post-search re-check, so
// the two can never disagree. Pure: no I/O.
import type { AccessLevel, Country, DocumentStatus, Domain, EmploymentType } from '@sd/shared';

/** The parts of an employee profile that decide document visibility. */
export interface AccessProfile {
  country: Country;
  employmentType: EmploymentType;
  accessLevel: AccessLevel;
}

/** A chunk's (or document's) audience metadata. */
export interface AudienceMeta {
  countries: readonly Country[];
  employmentTypes: readonly EmploymentType[];
  /** Minimum access level needed to read it. */
  accessLevel: AccessLevel;
  status: DocumentStatus;
  domain: Domain;
}

const LEVEL_RANK: Record<AccessLevel, number> = { standard: 0, manager: 1 };

/** Document access levels a profile may read: a manager also reads standard documents. */
export function allowedAccessLevels(level: AccessLevel): AccessLevel[] {
  return (Object.keys(LEVEL_RANK) as AccessLevel[]).filter(
    (l) => LEVEL_RANK[l] <= LEVEL_RANK[level],
  );
}

/** Only active documents are ever retrievable; superseded and inactive never are. */
export const RETRIEVABLE_STATUS: DocumentStatus = 'active';

export type AccessDenial = 'status' | 'country' | 'employment_type' | 'access_level';

/** Why a profile may not read this chunk, or null if it may. */
export function accessDenial(meta: AudienceMeta, profile: AccessProfile): AccessDenial | null {
  if (meta.status !== RETRIEVABLE_STATUS) return 'status';
  if (!meta.countries.includes(profile.country)) return 'country';
  if (!meta.employmentTypes.includes(profile.employmentType)) return 'employment_type';
  if (!allowedAccessLevels(profile.accessLevel).includes(meta.accessLevel)) return 'access_level';
  return null;
}

export function isAccessible(meta: AudienceMeta, profile: AccessProfile): boolean {
  return accessDenial(meta, profile) === null;
}
