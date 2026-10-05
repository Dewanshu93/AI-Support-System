// Public entry point of @sd/shared: enums, error envelope and API contracts
// imported by both web and api.

export * from './api/auth';
export * from './api/common';
export * from './api/health';
export * from './enums';
export * from './errors';

export const APP_NAME = 'AI Service Desk Front Door';

/** Base path every API route is mounted under (playbook section 4). */
export const API_BASE_PATH = '/api';

/** Response header carrying the request ID (also echoed in error envelopes). */
export const REQUEST_ID_HEADER = 'X-Request-Id';
