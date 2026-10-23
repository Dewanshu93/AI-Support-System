// Public entry point of @sd/shared: enums, error envelope and API contracts
// imported by both web and api.

export * from './api/actions';
export * from './api/agent';
export * from './api/auth';
export * from './api/chat-events';
export * from './api/common';
export * from './api/conversations';
export * from './api/documents';
export * from './api/evals';
export * from './api/gaps';
export * from './api/health';
export * from './api/leave';
export * from './api/metrics';
export * from './api/tickets';
export * from './api/traces';
export * from './api/workspace';
export * from './enums';
export * from './errors';

export const APP_NAME = 'Employee Hub';

/** Base path every API route is mounted under (playbook section 4). */
export const API_BASE_PATH = '/api';

/** Response header carrying the request ID (also echoed in error envelopes). */
export const REQUEST_ID_HEADER = 'X-Request-Id';
