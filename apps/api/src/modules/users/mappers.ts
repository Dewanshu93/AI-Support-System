import type { AuthUser, DemoUser, ProfileResponse } from '@sd/shared';
import type { UserDoc } from '../../db/schemas';

export function toAuthUser(doc: UserDoc): AuthUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    country: doc.country,
    employmentType: doc.employmentType,
    department: doc.department,
    jobTitle: doc.jobTitle,
    accessLevel: doc.accessLevel,
    queues: doc.queues,
  };
}

export function toDemoUser(doc: UserDoc): DemoUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    role: doc.role,
    country: doc.country,
    employmentType: doc.employmentType,
    jobTitle: doc.jobTitle,
  };
}

/** Profile view; `queues` is included only for agents. */
export function toProfile(user: AuthUser): ProfileResponse {
  const { name, email, role, country, employmentType, department, jobTitle, accessLevel } = user;
  return {
    name,
    email,
    role,
    country,
    employmentType,
    department,
    jobTitle,
    accessLevel,
    ...(role === 'agent' && { queues: user.queues }),
  };
}
