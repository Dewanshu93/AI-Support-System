import { DECISIONS, ErrorEnvelopeSchema, HealthResponseSchema } from '@sd/shared';

// W1-03 DoD: the shared contracts are importable and usable from the web app.
describe('@sd/shared contracts in web', () => {
  it('parses an API error envelope', () => {
    const envelope = ErrorEnvelopeSchema.parse({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: 'r-1' },
    });
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
  });

  it('exposes enums and response schemas', () => {
    expect(DECISIONS).toContain('ANSWER');
    expect(HealthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });
});
