import { afterEach, describe, expect, it } from 'vitest';
import { authorizeBackfill } from '../../supabase/functions/backfill-starter-economy/policy';

const SVC = 'svc-key';
(globalThis as any).Deno = { env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? SVC : undefined) } };
const db = (user: string | null, roles: string[], member: boolean) => ({
  auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: user ? null : 'bad' }) },
  from: (t: string) => {
    const q: any = { select: () => q, eq: () => q, limit: () => q,
      maybeSingle: async () => ({ data: { created_by: 'creator' }, error: null }),
      then: (r: any) => r({ data: t === 'user_roles' ? roles.map(role => ({ role })) : member ? [{ id: 1 }] : [], error: null }) };
    return q;
  },
});
const req = (tok?: string) => new Request('http://x', { method: 'POST', headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
afterEach(() => {});

describe('backfill-starter-economy authorization', () => {
  it('anonymous → 401', async () => {
    await expect(authorizeBackfill(req(), db(null, [], false), 's')).rejects.toMatchObject({ status: 401 });
  });
  it('invalid token → 401', async () => {
    await expect(authorizeBackfill(req('junk'), db(null, [], false), 's')).rejects.toMatchObject({ status: 401 });
  });
  it('session member without admin → 403 (dry-run included)', async () => {
    await expect(authorizeBackfill(req('u'), db('u1', [], true), 's')).rejects.toMatchObject({ status: 403 });
  });
  it('outsider → 403', async () => {
    await expect(authorizeBackfill(req('u'), db('u2', [], false), 's')).rejects.toMatchObject({ status: 403 });
  });
  it('admin and internal service call pass', async () => {
    await expect(authorizeBackfill(req('u'), db('a', ['admin'], false), 's')).resolves.toMatchObject({ admin: true });
    await expect(authorizeBackfill(req(SVC), db(null, [], false), 's')).resolves.toMatchObject({ service: true });
  });
});
