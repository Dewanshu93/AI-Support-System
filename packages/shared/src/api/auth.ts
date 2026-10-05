// Auth and profile contracts (playbook section 4: Auth, Profiles).
import { z } from 'zod';
import { AccessLevelSchema, CountrySchema, EmploymentTypeSchema, RoleSchema } from '../enums';
import { ObjectIdStringSchema } from './common';

/** Name of the httpOnly cookie carrying the session JWT. */
export const SESSION_COOKIE = 'sd_session';

/** GET /api/auth/demo-users: personas shown on the login picker. */
export const DemoUserSchema = z.object({
  id: ObjectIdStringSchema,
  name: z.string(),
  role: RoleSchema,
  country: CountrySchema,
  employmentType: EmploymentTypeSchema,
  jobTitle: z.string(),
});
export type DemoUser = z.infer<typeof DemoUserSchema>;
export const DemoUsersResponseSchema = z.object({
  users: z.array(DemoUserSchema),
  /** True when DEMO_PASSWORD is set, so the login picker shows a password field. */
  passwordRequired: z.boolean(),
});
export type DemoUsersResponse = z.infer<typeof DemoUsersResponseSchema>;

/** POST /api/auth/login: exactly one of userId or email; password only if DEMO_PASSWORD is set. */
export const LoginRequestSchema = z
  .strictObject({
    userId: ObjectIdStringSchema.optional(),
    email: z.email().optional(),
    password: z.string().min(1).max(200).optional(),
  })
  .refine((b) => (b.userId === undefined) !== (b.email === undefined), {
    message: 'provide exactly one of userId or email',
    path: ['userId'],
  });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** The authenticated user as returned by login and /me. */
export const AuthUserSchema = z.object({
  id: ObjectIdStringSchema,
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  country: CountrySchema,
  employmentType: EmploymentTypeSchema,
  department: z.string(),
  jobTitle: z.string(),
  accessLevel: AccessLevelSchema,
  queues: z.array(z.string()),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;
export const AuthUserResponseSchema = z.object({ user: AuthUserSchema });
export type AuthUserResponse = z.infer<typeof AuthUserResponseSchema>;

/** GET /api/profiles/me (read-only in the MVP; production: HRIS). `queues` only for agents. */
export const ProfileResponseSchema = z.object({
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  country: CountrySchema,
  employmentType: EmploymentTypeSchema,
  department: z.string(),
  jobTitle: z.string(),
  accessLevel: AccessLevelSchema,
  queues: z.array(z.string()).optional(),
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
