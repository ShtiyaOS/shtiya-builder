#!/usr/bin/env node
/**
 * scripts/seed-demo.cjs — investor-demo dataset.
 *
 * Idempotent: every write is an upsert on a fixed UUID, so running it twice
 * produces the same database rather than a second copy of everything.
 *
 * It seeds only tables that are ACTUALLY DEPLOYED (verified against the live
 * project). It does not attempt to populate the HRAG vault — vault_nodes and
 * scope_templates exist but resolve_scope_set() does not, so a corpus seeded
 * here would be unreachable. That is why the Co-Pilot runs with
 * COPILOT_DEMO_MODE=true and labels its answers ungrounded.
 *
 * Usage:  node scripts/seed-demo.cjs
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- env -------------------------------------------------------------------
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// --- fixed identities ------------------------------------------------------
const DEMO_EMAIL    = 'demo@shtiya.build';
const DEMO_PASSWORD = 'ShtiyaDemo!2026';

const ID = {
  user:  '33333333-3333-4333-8333-333333333333',  // users.id is a SURROGATE key,
  firm:  '11111111-1111-4111-8111-111111111111',  // not auth.uid() — auth_user_id
  prop1: '22222222-2222-4222-8222-222222222221',  // carries that link.
  prop2: '22222222-2222-4222-8222-222222222222',
  prop3: '22222222-2222-4222-8222-222222222223',
};

const log = (...a) => console.log('  ', ...a);

async function upsert(table, rows, onConflict = 'id') {
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) {
    console.log(`   !! ${table}: ${error.message}`);
    return false;
  }
  log(`${table}: ${rows.length} row(s)`);
  return true;
}

(async () => {
  console.log('\nSeeding Shtiya Builder demo data\n');

  // 1 — auth user ------------------------------------------------------------
  let authUserId = null;
  const { data: existing } = await db.auth.admin.listUsers();
  const found = existing?.users?.find(u => u.email === DEMO_EMAIL);

  if (found) {
    authUserId = found.id;
    await db.auth.admin.updateUserById(authUserId, { password: DEMO_PASSWORD });
    log(`auth user: reused ${DEMO_EMAIL}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) { console.log('   !! auth: ' + error.message); process.exit(1); }
    authUserId = data.user.id;
    log(`auth user: created ${DEMO_EMAIL}`);
  }

  // 2 — public.users ---------------------------------------------------------
  await upsert('users', [{
    id:            ID.user,
    auth_user_id:  authUserId,
    email:         DEMO_EMAIL,
    full_name:     'Dana Okonkwo',
    platform_role: 'owner_investor',   // → owner_advisor, via type-resolver.ts
  }]);

  // 2b — orphaned auth users --------------------------------------------------
  // Accounts that exist in auth but have no public.users row carry no role, so
  // the middleware refuses them on every app route and `/` sends them to
  // /unauthorized. Giving each a profile turns a dead end into a usable login.
  //
  // NOTE: there is no 'admin' platform_role. users_role_check permits 27
  // values and none of them denotes an administrator, so admin@shtiya.com is
  // seeded as owner_investor — the broadest app set available — rather than
  // being handed an access level the schema does not define.
  const ORPHAN_ROLES = {
    'admin@shtiya.com': { role: 'owner_investor', name: 'Platform Admin' },
    default:            { role: 'contractor_gc',  name: 'E2E Contractor' },
  };

  for (const u of existing?.users ?? []) {
    if (u.email === DEMO_EMAIL) continue;
    const { data: has } = await db
      .from('users').select('id').eq('auth_user_id', u.id).maybeSingle();
    if (has) continue;

    const spec = ORPHAN_ROLES[u.email] ?? ORPHAN_ROLES.default;
    const { error } = await db.from('users').insert({
      auth_user_id:  u.id,
      email:         u.email,
      full_name:     spec.name,
      platform_role: spec.role,
    });
    log(error ? `orphan ${u.email}: ${error.message}` : `orphan ${u.email}: profile created (${spec.role})`);
  }

  // 3 — firm + membership ----------------------------------------------------
  await upsert('firms', [{
    id: ID.firm, name: 'Shtiya Capital Partners', firm_type: 'other',
  }]);
  await upsert('firm_members',
    [{ firm_id: ID.firm, user_id: ID.user, member_role: 'partner' }],
    'firm_id,user_id');

  // 4 — properties -----------------------------------------------------------
  // No jurisdiction_id column: that is added by migration 1084, which is not
  // applied here. demoScopeSet() reads the column, gets nothing, and falls back
  // to US-NY, which is correct for all three addresses.
  const props = [
    { id: ID.prop1, owner_id: ID.user, status: 'active',
      address: '1140 Bedford Avenue, Brooklyn, NY 11216',
      borough: 'Brooklyn', block: '01870', lot: '0042' },
    { id: ID.prop2, owner_id: ID.user, status: 'active',
      address: '88 Gerry Street, Brooklyn, NY 11206',
      borough: 'Brooklyn', block: '02264', lot: '0011' },
    { id: ID.prop3, owner_id: ID.user, status: 'active',
      address: '2301 Grand Concourse, Bronx, NY 10468',
      borough: 'Bronx', block: '03173', lot: '0007' },
  ];
  await upsert('properties', props);

  // 5 — party bindings, so the demo user is a real party to each subject ------
  await upsert('property_role_bindings', props.map(p => ({
    property_id: p.id, user_id: ID.user, capacity: 'owner_occupant',
  })), 'property_id,user_id,capacity');

  // 6 — report ---------------------------------------------------------------
  console.log('\nDemo credentials');
  console.log('  email    ', DEMO_EMAIL);
  console.log('  password ', DEMO_PASSWORD);
  console.log('\nSubjects the Co-Pilot can be asked about:');
  for (const p of props) console.log(`  property  ${p.id}  ${p.address}`);
  console.log('');
})();
