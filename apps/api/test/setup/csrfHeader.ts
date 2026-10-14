// API tests act as the web app (W4-07): every mutating Supertest request carries
// `X-Requested-With: sd-web`, as lib/api.ts and lib/sse.ts send it. A test that
// sets the header itself (e.g. to a wrong value) keeps its own value; the CSRF
// tests also call the middleware directly without it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- supertest/lib/test has no types
const Test = require('supertest/lib/test') as {
  prototype: {
    method: string;
    _header: Record<string, string | undefined>;
    set(field: string, value: string): unknown;
    end(fn?: unknown): unknown;
  };
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const end = Test.prototype.end;
Test.prototype.end = function patchedEnd(this: typeof Test.prototype, fn?: unknown) {
  if (MUTATING.has(this.method) && this._header['x-requested-with'] === undefined) {
    this.set('X-Requested-With', 'sd-web');
  }
  return end.call(this, fn);
};
