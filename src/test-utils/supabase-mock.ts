/**
 * A chainable stand-in for the Supabase JS client, shaped to the subset the
 * route handlers actually use: auth.getUser, from().select().eq().maybeSingle(),
 * from().insert().select().single(), and rpc().
 *
 * Not collected by Jest — testMatch is src/**\/*.test.ts.
 *
 * `tables` and `rpc` values may be a single value (returned for every call) or
 * an array (consumed in call order), which is how a route that reads the same
 * table twice — the caller's users row, then the maker's — is driven.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SupabaseMockOptions {
  /** The auth user returned by auth.getUser(). null/omitted ⇒ 401 path. */
  user?: { id: string } | null;
  /** Per-table result data. Array values are consumed in call order. */
  tables?: Record<string, any>;
  /** Per-RPC result data. Array values are consumed in call order. */
  rpc?: Record<string, any>;
  /** Result of the terminal .single() after .insert(). */
  insertResult?: { data: any; error: any };
}

function take(source: Record<string, any> | undefined, key: string): any {
  if (!source || !(key in source)) return null;
  const value = source[key];
  if (Array.isArray(value)) return value.length > 0 ? value.shift() : null;
  return value;
}

export interface SupabaseMock {
  auth: { getUser: jest.Mock };
  from: jest.Mock;
  rpc: jest.Mock;
  /** Every payload passed to .insert(), in order — for asserting what was written. */
  inserts: Array<{ table: string; payload: any }>;
}

export function makeSupabaseMock(options: SupabaseMockOptions = {}): SupabaseMock {
  const inserts: Array<{ table: string; payload: any }> = [];

  const from = jest.fn((table: string) => {
    const chain: any = {};
    const self = () => chain;

    chain.select = jest.fn(self);
    chain.eq     = jest.fn(self);
    chain.is     = jest.fn(self);
    chain.gt     = jest.fn(self);
    chain.limit  = jest.fn(self);
    chain.order  = jest.fn(self);
    chain.update = jest.fn(self);

    chain.maybeSingle = jest.fn(async () => ({ data: take(options.tables, table), error: null }));
    chain.single      = jest.fn(async () => ({ data: take(options.tables, table), error: null }));

    chain.insert = jest.fn((payload: any) => {
      inserts.push({ table, payload });
      const ins: any = {};
      ins.select = jest.fn(() => ins);
      ins.single = jest.fn(async () =>
        options.insertResult ?? { data: { id: 'inserted-id' }, error: null });
      ins.maybeSingle = ins.single;
      return ins;
    });

    return chain;
  });

  return {
    auth: {
      getUser: jest.fn(async () =>
        options.user
          ? { data: { user: options.user }, error: null }
          : { data: { user: null }, error: new Error('no auth') }),
    },
    from,
    rpc: jest.fn(async (name: string) => ({ data: take(options.rpc, name), error: null })),
    inserts,
  };
}

/** Builds a NextRequest-compatible POST with a bearer token. */
export function jsonPostInit(body: unknown, token = 'valid-token'): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  };
}
