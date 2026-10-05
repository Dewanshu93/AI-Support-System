// Permission layers 1 and 2 (playbook section 7), both built from accessRules:
// the Qdrant pre-filter (inaccessible chunks are never returned) and
// assertAccessible (an independent re-check before anything reaches an LLM).
import type { Domain } from '@sd/shared';
import {
  type AccessDenial,
  accessDenial,
  type AccessProfile,
  allowedAccessLevels,
  type AudienceMeta,
  RETRIEVABLE_STATUS,
} from './accessRules';

export interface QdrantCondition {
  key: string;
  match: { value: string } | { any: string[] };
}
export interface QdrantFilter {
  must: QdrantCondition[];
}

/**
 * Pre-filter applied inside both searches: active, the profile's country and
 * employment type, an allowed access level, and optionally a domain hint.
 * (Array payload fields match when any element equals the value.)
 */
export function buildAccessFilter(
  profile: AccessProfile,
  options: { domain?: Domain } = {},
): QdrantFilter {
  const must: QdrantCondition[] = [
    { key: 'status', match: { value: RETRIEVABLE_STATUS } },
    { key: 'countries', match: { value: profile.country } },
    { key: 'employmentTypes', match: { value: profile.employmentType } },
    { key: 'accessLevel', match: { any: allowedAccessLevels(profile.accessLevel) } },
  ];
  if (options.domain) must.push({ key: 'domain', match: { value: options.domain } });
  return { must };
}

export interface AccessViolation {
  chunkId: string;
  reason: AccessDenial;
}

/**
 * Re-checks a candidate's metadata. A violation means the pre-filter let
 * something through: it is reported (logged as ACCESS_FILTER_VIOLATION by the
 * caller, and failing tests) and the chunk must be dropped.
 */
export function assertAccessible(
  chunk: AudienceMeta & { _id: { toHexString(): string } },
  profile: AccessProfile,
): AccessViolation | null {
  const reason = accessDenial(chunk, profile);
  return reason ? { chunkId: chunk._id.toHexString(), reason } : null;
}
