// Enums shared by web and api. W1-03 adds roles, decisions and statuses.

export const DOMAINS = ['IT', 'HR'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Ordered lowest to highest; priority floors compare by index. */
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];
