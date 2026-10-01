// One member, several sign-ins (supabase/migrations/20261012000000_member_accounts.sql): linking another email,
// staff merges and unlinking, on a real Postgres (PGlite) running every migration.
// Run: cd supabase/functions && deno test --allow-env --allow-read . ../tests
import { assertEquals, assertRejects } from "@std/assert";
import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { addUsers, applyMigrations, emptyDb, migratedDb, runAs, type User } from "./harness.ts";

// Maria signs in with her personal email and, as staff, with her Workspace account.
const maria: User = { id: "00000000-0000-0000-0000-0000000000a1", email: "maria@gmail.com", name: "Maria K" };
const mariaWork: User = { id: "00000000-0000-0000-0000-0000000000a2", email: "maria@activezoneoutdoor.cy", name: "Maria Kyriakou" };
const nikos: User = { id: "00000000-0000-0000-0000-0000000000b1", email: "nikos@gmail.com", name: "Nikos P" };
const staff: User = { id: "00000000-0000-0000-0000-0000000000c1", email: "achernar@activezoneoutdoor.cy" };

type Member = { id: string; email: string | null; full_name: string; phone: string | null; status: string; member_number: string | null; registered_on: string | null };

async function setup() {
  const db = await migratedDb();
  await addUsers(db, maria, mariaWork, nikos, staff);
  const as = runAs(db);
  await as(staff, "insert into staff_roles (email, role) values ('maria@activezoneoutdoor.cy', 'staff')");
  const claim = async (u: User, token?: string) =>
    (await as<Member>(u, "select * from claim_membership($1)", [token ?? null]))[0];
  const startLink = async (u: User) => (await as<{ token: string }>(u, "select start_account_link() as token"))[0].token;
  return { db, as, claim, startLink };
}

const accounts = async (db: PGlite) =>
  (await db.query<{ user_id: string; member_id: string; email: string }>("select user_id, member_id, email from member_accounts order by email")).rows;

Deno.test("the migration keeps each existing member's sign-in", async () => {
  const MIGRATION = "20261012000000_member_accounts.sql";
  const db = await emptyDb();
  await applyMigrations(db, { until: MIGRATION });
  await addUsers(db, maria, nikos);
  await db.query("insert into members (user_id, email, full_name) values ($1, 'maria@gmail.com', 'Maria'), ($2, null, 'Nikos'), (null, 'eleni@gmail.com', 'Eleni')", [maria.id, nikos.id]);
  await applyMigrations(db, { from: MIGRATION });
  const rows = (await db.query<{ user_id: string; email: string; full_name: string }>(
    "select a.user_id, a.email, m.full_name from member_accounts a join members m on m.id = a.member_id order by m.full_name",
  )).rows;
  assertEquals(rows, [
    { user_id: maria.id, email: "maria@gmail.com", full_name: "Maria" },
    { user_id: nikos.id, email: "nikos@gmail.com", full_name: "Nikos" }, // from the sign-in when the record has none
  ]);
  const as = runAs(db);
  assertEquals((await as<{ full_name: string }>(maria, "select * from claim_membership()"))[0].full_name, "Maria");
});

Deno.test("signing in with another email after starting a link adds it to the same member", async () => {
  const { db, as, claim, startLink } = await setup();
  const own = await claim(maria);
  const token = await startLink(maria);

  const linked = await claim(mariaWork, token);
  assertEquals(linked.id, own.id);
  assertEquals((await accounts(db)).map((a) => [a.email, a.member_id]), [
    ["maria@activezoneoutdoor.cy", own.id],
    ["maria@gmail.com", own.id],
  ]);
  // Either sign-in now opens the same record, and the link token can't be used twice.
  assertEquals((await claim(mariaWork)).id, own.id);
  assertEquals((await claim(maria)).id, own.id);
  await assertRejects(() => claim(nikos, token), Error, "expired");
  // The member sees both sign-ins; the team role still follows the sign-in.
  assertEquals((await as(maria, "select email from member_accounts")).length, 2);
  assertEquals((await as<{ role: string | null }>(maria, "select my_role() as role"))[0].role, null);
  assertEquals((await as<{ role: string | null }>(mariaWork, "select my_role() as role"))[0].role, "staff");
});

Deno.test("linking merges a bare record the other email already had", async () => {
  const { db, claim, startLink } = await setup();
  const own = await claim(maria);
  const other = await claim(mariaWork); // signed in once before, so it has its own online record
  const linked = await claim(mariaWork, await startLink(maria));
  assertEquals(linked.id, own.id);
  assertEquals((await db.query("select 1 from members where id = $1", [other.id])).rows.length, 0);
  assertEquals((await accounts(db)).every((a) => a.member_id === own.id), true);
});

Deno.test("linking refuses to merge a record with membership details; staff must merge it", async () => {
  const { as, claim, startLink } = await setup();
  await claim(maria);
  const other = await claim(mariaWork);
  await as(staff, "update members set status = 'registered', member_number = 'AZO-7' where id = $1", [other.id]);
  const token = await startLink(maria);
  await assertRejects(() => claim(mariaWork, token), Error, "Ask the team to merge");
  // Nothing changed: the work email still opens its own record.
  assertEquals((await claim(mariaWork)).id, other.id);
});

Deno.test("an expired, unknown or already-linked link token is refused", async () => {
  const { db, claim, startLink } = await setup();
  await claim(maria);
  await assertRejects(() => claim(mariaWork, "not-a-token"), Error, "expired");
  const token = await startLink(maria);
  await db.exec("update member_link_requests set expires_at = now() - interval '1 minute'");
  await assertRejects(() => claim(mariaWork, token), Error, "expired");
  const again = await startLink(maria);
  await assertRejects(() => claim(maria, again), Error, "already linked");
});

Deno.test("only members with a record can start a link, and the token is stored hashed", async () => {
  const { db, as, claim, startLink } = await setup();
  await assertRejects(() => startLink(nikos), Error, "Open your profile first");
  await claim(maria);
  const token = await startLink(maria);
  const [row] = (await db.query<{ token_hash: string }>("select token_hash from member_link_requests")).rows;
  assertEquals(row.token_hash === token, false);
  assertEquals(row.token_hash.length, 64);
  // Starting again replaces the earlier request.
  await startLink(maria);
  assertEquals((await db.query("select 1 from member_link_requests")).rows.length, 1);
  // Nobody reads or writes link requests or links directly.
  await assertRejects(() => as(maria, "select * from member_link_requests"));
  await assertRejects(() => as(maria, "insert into member_accounts (user_id, member_id) values ($1, my_member_id())", [nikos.id]));
});

Deno.test("staff merge two records of the same person", async () => {
  const { db, as, claim } = await setup();
  const personal = await claim(maria);
  await as(maria, "update members set phone = '+357 99 111111' where id = my_member_id()");
  const work = await claim(mariaWork);
  await as(staff, "update members set full_name = '', status = 'registered', member_number = 'AZO-9', registered_on = '2023-04-01' where id = $1", [work.id]);
  await as(staff, "insert into membership_payments (member_id, year, amount) values ($1, 2025, 20)", [work.id]);

  const [kept] = await as<Member>(staff, "select * from merge_members($1, $2)", [personal.id, work.id]);
  assertEquals(kept.id, personal.id);
  assertEquals(kept.full_name, "Maria K"); // the kept record's details win
  assertEquals(kept.phone, "+357 99 111111");
  assertEquals(kept.email, "maria@gmail.com");
  assertEquals(kept.status, "registered"); // the more established status
  assertEquals(kept.member_number, "AZO-9"); // filled from the merged record
  const [{ since }] = await as<{ since: string }>(staff, "select registered_on::text as since from members where id = $1", [kept.id]);
  assertEquals(since, "2023-04-01");
  assertEquals((await as(staff, "select 1 from membership_payments where member_id = $1", [personal.id])).length, 1);
  assertEquals((await accounts(db)).every((a) => a.member_id === personal.id), true);
  assertEquals((await claim(mariaWork)).id, personal.id);
  // The merged record's email can be used again (it was unique).
  assertEquals((await as(staff, "select 1 from members")).length, 1);
});

Deno.test("only staff can merge, and not a record with itself", async () => {
  const { as, claim } = await setup();
  const a = await claim(maria);
  const b = await claim(nikos);
  await assertRejects(() => as(maria, "select merge_members($1, $2)", [a.id, b.id]), Error, "Only staff");
  await assertRejects(() => as(maria, "select merge_member_records($1, $2)", [a.id, b.id]));
  await assertRejects(() => as(staff, "select merge_members($1, $1)", [a.id]), Error, "two different");
});

Deno.test("members unlink their other sign-ins but not the one they're using; staff unlink any", async () => {
  const { db, as, claim, startLink } = await setup();
  const own = await claim(maria);
  await claim(mariaWork, await startLink(maria));

  assertEquals((await as(maria, "delete from member_accounts where user_id = $1 returning user_id", [maria.id])).length, 0);
  assertEquals((await as(maria, "delete from member_accounts where user_id = $1 returning user_id", [mariaWork.id])).length, 1);
  // Unlinked, the work email gets a fresh record on its next sign-in.
  const fresh = await claim(mariaWork);
  assertEquals(fresh.id === own.id, false);
  assertEquals(fresh.email, "maria@activezoneoutdoor.cy");

  await claim(nikos);
  assertEquals((await as(nikos, "delete from member_accounts where user_id = $1 returning user_id", [maria.id])).length, 0);
  assertEquals((await as(staff, "delete from member_accounts where user_id = $1 returning user_id", [maria.id])).length, 1);
  assertEquals((await accounts(db)).some((a) => a.user_id === maria.id), false);
});

Deno.test("a new sign-in whose email is already another member's contact email gets a record without it", async () => {
  const { as, claim } = await setup();
  const m = await claim(maria);
  await as(staff, "update members set email = 'nikos@gmail.com' where id = $1", [m.id]);
  const n = await claim(nikos);
  assertEquals(n.id === m.id, false);
  assertEquals(n.email, null);
});
