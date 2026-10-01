// Row level security tests for member accounts (supabase/migrations/20261010000000_members.sql), on a real
// Postgres (PGlite) running every migration. Run: cd supabase/functions && deno test --allow-env --allow-read . ../tests
import { assert, assertEquals, assertRejects } from "@std/assert";
import { addUsers, migratedDb, runAs, type User } from "./harness.ts";

const maria: User = { id: "00000000-0000-0000-0000-00000000000a", email: "maria@gmail.com", name: "Maria K" };
const nikos: User = { id: "00000000-0000-0000-0000-00000000000b", email: "Nikos@Example.com", name: "Nikos P" };
// Staff means a staff_roles row now: achernar@ is the admin the roles migration creates.
const staff: User = { id: "00000000-0000-0000-0000-00000000000c", email: "achernar@activezoneoutdoor.cy" };
const leo: User = { id: "00000000-0000-0000-0000-00000000000d", email: "leo@gmail.com", name: "Leo" };
const domainNoRole: User = { id: "00000000-0000-0000-0000-00000000000e", email: "newbie@activezoneoutdoor.cy" };

async function setup() {
  const db = await migratedDb();
  await addUsers(db, maria, nikos, staff, leo, domainNoRole);
  const as = runAs(db);
  await as(staff, "insert into staff_roles (email, role) values ('leo@gmail.com', 'leader')");
  return { db, as };
}

const year = new Date().getFullYear();

Deno.test("first sign-in creates an online member from the Google profile, and is idempotent", async () => {
  const { as } = await setup();
  const [first] = await as<
    { id: string; status: string; email: string; full_name: string }
  >(
    nikos,
    "select * from claim_membership()",
  );
  assertEquals(first.status, "online");
  assertEquals(first.email, "nikos@example.com");
  assertEquals(first.full_name, "Nikos P");
  const [again] = await as<{ id: string }>(
    nikos,
    "select * from claim_membership()",
  );
  assertEquals(again.id, first.id);
});

Deno.test("sign-in links a member staff registered beforehand with the same email", async () => {
  const { as } = await setup();
  await as(
    staff,
    `insert into members (email, full_name, status, member_number, registered_on)
                   values ('MARIA@gmail.com', 'Maria Kyriakou', 'registered', 'AZO-001', '2024-03-01')`,
  );
  const [row] = await as<
    {
      status: string;
      member_number: string;
      full_name: string;
      user_id: string;
    }
  >(
    maria,
    "select * from claim_membership()",
  );
  assertEquals(row.status, "registered");
  assertEquals(row.member_number, "AZO-001");
  assertEquals(row.full_name, "Maria Kyriakou"); // staff's name is kept
  assertEquals(row.user_id, maria.id);
});

Deno.test("staff sign-in creates their own member record too", async () => {
  const { as } = await setup();
  await as(maria, "select claim_membership()");
  const [row] = await as<{ id: string | null; user_id: string; email: string; status: string }>(
    staff,
    "select * from claim_membership()",
  );
  assertEquals(row.user_id, staff.id);
  assertEquals(row.email, staff.email);
  assertEquals(row.status, "online");
  // Claiming again returns the same row, and staff still see every member.
  const [again] = await as<{ id: string }>(staff, "select (claim_membership()).id as id");
  assertEquals(again.id, row.id);
  assertEquals((await as(staff, "select * from members")).length, 2);
});

Deno.test("staff can edit their own profile", async () => {
  const { as } = await setup();
  const [row] = await as<{ id: string }>(staff, "select (claim_membership()).id as id");
  const [updated] = await as<{ full_name: string; phone: string }>(
    staff,
    "update members set full_name = 'Achernar', phone = '+357 99 000000' where id = $1 returning full_name, phone",
    [row.id],
  );
  assertEquals(updated.full_name, "Achernar");
  assertEquals(updated.phone, "+357 99 000000");
});

Deno.test("anonymous visitors can't read or claim anything", async () => {
  const { as } = await setup();
  await assertRejects(() => as(null, "select * from claim_membership()"));
  await assertRejects(() => as(null, "select * from members"));
  await assertRejects(() => as(null, "select * from membership_payments"));
});

Deno.test("members only see their own row and payments", async () => {
  const { as } = await setup();
  await as(maria, "select claim_membership()");
  const [n] = await as<{ id: string }>(
    nikos,
    "select (claim_membership()).id as id",
  );
  await as(
    staff,
    "insert into membership_payments (member_id, year, amount) values ($1, $2, 20)",
    [n.id, year],
  );

  assertEquals((await as(maria, "select * from members")).length, 1);
  assertEquals(
    (await as(maria, "select * from membership_payments")).length,
    0,
  );
  assertEquals(
    (await as(nikos, "select * from membership_payments")).length,
    1,
  );
  assertEquals((await as(staff, "select * from members")).length, 2);
});

Deno.test("members can edit name and phone but not membership details", async () => {
  const { as } = await setup();
  await as(maria, "select claim_membership()");
  const [row] = await as<{ full_name: string; phone: string }>(
    maria,
    "update members set full_name = ' Maria K. ', phone = '+357 99 000000' where user_id = auth.uid() returning *",
  );
  assertEquals(row.full_name, "Maria K.");
  assertEquals(row.phone, "+357 99 000000");

  for (
    const change of [
      "status = 'registered'",
      "member_number = 'X1'",
      "registered_on = '2020-01-01'",
      "email = 'other@gmail.com'",
      "user_id = null",
    ]
  ) {
    await assertRejects(
      () => as(maria, `update members set ${change} where user_id = auth.uid()`),
      Error,
      "Only staff",
      change,
    );
  }
});

Deno.test("members can't touch other members, fees or payments", async () => {
  const { as } = await setup();
  await as(maria, "select claim_membership()");
  const [n] = await as<{ id: string }>(
    nikos,
    "select (claim_membership()).id as id",
  );

  assertEquals(
    (await as(
      maria,
      "update members set full_name = 'x' where id = $1 returning id",
      [n.id],
    )).length,
    0,
  );
  assertEquals(
    (await as(
      maria,
      "delete from members where user_id = auth.uid() returning id",
    )).length,
    0,
  );
  await assertRejects(() => as(maria, "insert into members (email) values ('x@gmail.com')"));
  await assertRejects(() => as(maria, "insert into membership_fees (year, amount) values (2026, 1)"));
  await assertRejects(() =>
    as(
      maria,
      "insert into membership_payments (member_id, year, amount) values ($1, 2026, 20)",
      [n.id],
    )
  );
});

Deno.test("yearly summary covers every year since registration with fee and amount paid", async () => {
  const { as } = await setup();
  await as(
    staff,
    `insert into members (email, status, registered_on) values ('maria@gmail.com', 'registered', $1)`,
    [
      `${year - 2}-05-01`,
    ],
  );
  const [m] = await as<{ id: string }>(
    maria,
    "select (claim_membership()).id as id",
  );
  await as(
    staff,
    "insert into membership_fees (year, amount) values ($1, 20), ($2, 25)",
    [year - 2, year],
  );
  await as(
    staff,
    "insert into membership_payments (member_id, year, amount, method) values ($1, $2, 20, 'cash'), ($1, $3, 10, 'bank_transfer'), ($1, $3, 5, 'cash')",
    [m.id, year - 2, year],
  );

  const rows = await as<{ year: number; fee: string | null; paid: string }>(
    maria,
    "select year, fee, paid from membership_years order by year",
  );
  assertEquals(rows, [
    { year: year - 2, fee: "20.00", paid: "20.00" },
    { year: year - 1, fee: null, paid: "0.00" },
    { year, fee: "25.00", paid: "15.00" },
  ]);
  assertEquals((await as(nikos, "select * from membership_years")).length, 0);
});

Deno.test("recorded_by is the staff member who recorded the payment", async () => {
  const { as } = await setup();
  const [m] = await as<{ id: string }>(
    maria,
    "select (claim_membership()).id as id",
  );
  const [p] = await as<{ recorded_by: string }>(
    staff,
    "insert into membership_payments (member_id, year, amount) values ($1, 2026, 20) returning recorded_by",
    [m.id],
  );
  assertEquals(p.recorded_by, staff.id);
  assert(true);
});

Deno.test("leaders and domain accounts without a role see no member data", async () => {
  const { as } = await setup();
  const [m] = await as<{ id: string }>(maria, "select (claim_membership()).id as id");
  await as(staff, "insert into membership_payments (member_id, year, amount) values ($1, $2, 20)", [m.id, year]);
  for (const u of [leo, domainNoRole]) {
    assertEquals((await as(u, "select * from members where id = $1", [m.id])).length, 0, u.email);
    assertEquals((await as(u, "select * from membership_payments")).length, 0, u.email);
    assertEquals((await as(u, "select * from membership_years where member_id = $1", [m.id])).length, 0, u.email);
    await assertRejects(() => as(u, "insert into membership_fees (year, amount) values (2030, 1)"));
  }
});

Deno.test("leaders can have their own membership; a domain account without a role is a member too", async () => {
  const { as } = await setup();
  const [l] = await as<{ status: string; email: string }>(leo, "select * from claim_membership()");
  assertEquals([l.status, l.email], ["online", "leo@gmail.com"]);
  const [d] = await as<{ status: string }>(domainNoRole, "select * from claim_membership()");
  assertEquals(d.status, "online");
});

Deno.test("removing a staff member's role stops them managing members", async () => {
  const { as } = await setup();
  await as(staff, "insert into staff_roles (email, role) values ('olga@activezoneoutdoor.cy', 'staff')");
  const olga: User = { id: "00000000-0000-0000-0000-00000000000f", email: "olga@activezoneoutdoor.cy" };
  await as(olga, "insert into members (email, full_name, status) values ('x@gmail.com', 'X', 'registered')");
  assertEquals((await as(olga, "select * from members")).length, 1);
  await as(staff, "delete from staff_roles where email = 'olga@activezoneoutdoor.cy'");
  assertEquals((await as(olga, "select * from members")).length, 0);
  await assertRejects(() => as(olga, "insert into members (email, full_name) values ('y@gmail.com', 'Y')"));
});
