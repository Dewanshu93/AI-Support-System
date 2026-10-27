import * as shared from './index';
import {
  DECISIONS,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ErrorEnvelopeSchema,
  ObjectIdStringSchema,
  paginatedSchema,
  PaginationQuerySchema,
  PRIORITIES,
  ROLES,
} from './index';

describe('enums', () => {
  const tuples = Object.entries(shared).filter(
    ([name, value]) => /^[A-Z_]+$/.test(name) && Array.isArray(value),
  ) as [string, readonly string[]][];

  it('exports enum tuples', () => {
    expect(tuples.map(([name]) => name)).toEqual(
      expect.arrayContaining(['ROLES', 'DECISIONS', 'TICKET_STATUSES', 'PRIORITIES', 'DOMAINS']),
    );
  });

  it.each(tuples)('%s has unique, non-empty values', (_name, values) => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
  });

  it('matches the playbook values that code depends on', () => {
    expect(ROLES).toEqual(['employee', 'agent', 'admin']);
    expect(DECISIONS).toHaveLength(6);
    expect(PRIORITIES).toEqual(['low', 'medium', 'high', 'critical']);
  });
});

describe('error envelope', () => {
  it('assigns an HTTP status to every error code', () => {
    expect(ERROR_CODES).toHaveLength(10);
    expect(ERROR_HTTP_STATUS.DUPLICATE_CANDIDATE).toBe(409);
    for (const code of ERROR_CODES) expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
  });

  it('accepts a well-formed envelope, with or without details', () => {
    const base = { code: 'NOT_FOUND', message: 'Not found', requestId: 'r-1' };
    expect(ErrorEnvelopeSchema.safeParse({ error: base }).success).toBe(true);
    expect(ErrorEnvelopeSchema.safeParse({ error: { ...base, details: { a: 1 } } }).success).toBe(
      true,
    );
  });

  it.each([
    ['unknown code', { code: 'TEAPOT', message: 'x', requestId: 'r' }],
    ['missing requestId', { code: 'INTERNAL', message: 'x' }],
    ['missing message', { code: 'INTERNAL', requestId: 'r' }],
  ])('rejects %s', (_name, error) => {
    expect(ErrorEnvelopeSchema.safeParse({ error }).success).toBe(false);
  });
});

describe('common API schemas', () => {
  it('defaults limit to 20 and caps it at 100', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(PaginationQuerySchema.parse({ limit: '50', cursor: 'abc' })).toEqual({
      limit: 50,
      cursor: 'abc',
    });
    expect(PaginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('validates ObjectId strings', () => {
    expect(ObjectIdStringSchema.safeParse('65f1c2a9e4b0a1b2c3d4e5f6').success).toBe(true);
    expect(ObjectIdStringSchema.safeParse('not-an-id').success).toBe(false);
  });

  it('builds paginated list schemas', () => {
    const schema = paginatedSchema(ObjectIdStringSchema);
    expect(schema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(schema.safeParse({ items: ['bad'], nextCursor: null }).success).toBe(false);
  });
});
