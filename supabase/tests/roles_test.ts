// Row level security tests for roles (supabase/migrations/20261008000000_roles.sql), on a real Postgres (PGlite)
// running every migration in order, with Supabase's auth helpers recreated as they behave in production.
// Run: cd supabase/functions && deno test --allow-env --allow-read . ../tests
import { assert, assertEquals, assertRejects } from "@std/assert";
import { addUsers, migratedDb, runAs, type User } from "./harness.ts";

const admin: User = { id: "00000000-0000-0000-0000-000000000001", email: "achernar@activezoneoutdoor.cy" };
const olga: User = { id: "00000000-0000-0000-0000-000000000002", email: "olga@activezoneoutdoor.cy" };
const newbie: User = { id: "00000000-0000-0000-0000-000000000003", email: "newbie@activezoneoutdoor.cy" };
const leo: User = { id: "00000000-0000-0000-0000-000000000004", email: "leo@gmail.com" };
const mary: User = { id: "00000000-0000-0000-0000-000000000005", email: "mary@gmail.com" };

async function setup() {
  // Olga signed in as staff before roles existed; the others' accounts are created later.
  const db = await migratedDb((db) => addUsers(db, { ...olga, email: "Olga@ActiveZoneOutdoor.cy" }));
  await addUsers(db, admin, newbie, leo, mary);
  const as = runAs(db);

  // Two draft events: Leo leads the first (email typed with different case and spaces), not the second.
  const [ledEvent] = await as<{ id: string }>(
    admin,
    `insert into events (slug, title, activity, starts_at, location_name, leader_email, price_cents)
     values ('led', 'Led by Leo', 'Hiking', now() + interval '10 days', 'Troodos', ' Leo@Gmail.com ', 1500) returning id`,
  );
  const [otherEvent] = await as<{ id: string }>(
    admin,
    `insert into events (slug, title, activity, starts_at, location_name, leader_email)
     values ('other', 'Someone else', 'Kayak', now() + interval '10 days', 'Larnaca', 'x@gmail.com') returning id`,
  );
  const booking = async (eventId: string) =>
    (await as<{ id: string }>(
      admin,
      `insert into bookings (event_id, contact_name, email, attendees) values ($1, 'Ann', 'ann@example.com', '{Ann}')
       returning id`,
      [eventId],
    ))[0].id;
  const ledBooking = await booking(ledEvent.id);
  const otherBooking = await booking(otherEvent.id);
  const [ledMedia] = await as<{ id: string }>(
    admin,
    "insert into media (event_id, drive_file_id, name, mime_type) values ($1, 'f1', 'a.jpg', 'image/jpeg') returning id",
    [ledEvent.id],
  );
  await as(admin, "insert into staff_roles (email, role) values ('leo@gmail.com', 'leader')");

  return { db, as, ledEvent: ledEvent.id, otherEvent: otherEvent.id, ledBooking, otherBooking, ledMedia: ledMedia.id };
}

const role = async (as: Awaited<ReturnType<typeof setup>>["as"], user: User) =>
  (await as<{ r: string | null }>(user, "select my_role() as r"))[0].r;

Deno.test("setup seeds the first admin and keeps everyone who already signed in as staff", async () => {
  const { as } = await setup();
  assertEquals(await role(as, admin), "admin");
  assertEquals(await role(as, olga), "staff");
  assertEquals(await role(as, newbie), null);
  assertEquals(await role(as, mary), null);
});

Deno.test("a domain email without a role has no staff access", async () => {
  const { as, ledEvent } = await setup();
  assertEquals((await as(newbie, "select id from events")).length, 0);
  await assertRejects(() =>
    as(newbie, "insert into events (slug, title, activity, starts_at, location_name) values ('x','x','x',now(),'x')")
  );
  await assertRejects(
    () => as(newbie, "select rotate_upload_link($1)", [ledEvent]),
    Error,
    "Only Active Zone Outdoor staff",
  );
});

Deno.test("removing someone from the team removes their access on the next request", async () => {
  const { as } = await setup();
  assertEquals((await as(olga, "select id from events")).length, 2);
  await as(admin, "delete from staff_roles where email = 'olga@activezoneoutdoor.cy'");
  assertEquals((await as(olga, "select id from events")).length, 0);
  assertEquals((await as(olga, "select id from bookings")).length, 0);
});

Deno.test("only admins manage the team, and grants are stamped with who gave them", async () => {
  const { as } = await setup();
  await assertRejects(() =>
    as(olga, "insert into staff_roles (email, role) values ('newbie@activezoneoutdoor.cy', 'staff')")
  );
  assertEquals(
    (await as(olga, "update staff_roles set role = 'admin' where email = $1 returning *", [olga.email])).length,
    0,
  );
  assertEquals((await as(olga, "select email from staff_roles")).map((r) => r.email), [olga.email]); // own row only

  const [row] = await as<{ granted_by: string }>(
    admin,
    "insert into staff_roles (email, role, granted_by) values (' NewBie@ActiveZoneOutdoor.cy', 'staff', 'forged') returning granted_by",
  );
  assertEquals(row.granted_by, admin.email);
  assertEquals(await role(as, newbie), "staff");
});

Deno.test("admin and staff roles need a Workspace email; leaders can use any email", async () => {
  const { as } = await setup();
  await assertRejects(() => as(admin, "insert into staff_roles (email, role) values ('mary@gmail.com', 'staff')"));
  await assertRejects(() => as(admin, "insert into staff_roles (email, role) values ('mary@gmail.com', 'admin')"));
  await as(admin, "insert into staff_roles (email, role) values ('mary@gmail.com', 'leader')");
  assertEquals(await role(as, mary), "leader");
});

Deno.test("the last admin can't be removed or demoted", async () => {
  const { as } = await setup();
  await assertRejects(
    () => as(admin, "delete from staff_roles where email = $1", [admin.email]),
    Error,
    "at least one admin",
  );
  await assertRejects(() => as(admin, "update staff_roles set role = 'staff' where email = $1", [admin.email]));
  await as(admin, "update staff_roles set role = 'admin' where email = $1", [olga.email]);
  await as(olga, "delete from staff_roles where email = $1", [admin.email]);
  assertEquals(await role(as, admin), null);
});

Deno.test("leaders see only the events they lead, and can't edit them", async () => {
  const { as, ledEvent } = await setup();
  assertEquals((await as(leo, "select id from events")).map((r) => r.id), [ledEvent]);
  assertEquals((await as(leo, "update events set title = 'x' where id = $1 returning id", [ledEvent])).length, 0);
  await assertRejects(() => as(leo, "select rotate_upload_link($1)", [ledEvent]));
  assertEquals((await as(leo, "select * from event_upload_links")).length, 0);
});

Deno.test("leaders mark payments and cancel bookings of their events only", async () => {
  const { as, ledBooking, otherBooking } = await setup();
  assertEquals((await as(leo, "select id from bookings")).map((r) => r.id), [ledBooking]);

  const [paid] = await as<{ payment_status: string; paid_at: string | null }>(
    leo,
    "update bookings set payment_status = 'paid' where id = $1 returning payment_status, paid_at",
    [ledBooking],
  );
  assertEquals(paid.payment_status, "paid");
  assert(paid.paid_at, "paid_at is stamped by the database");
  assertEquals((await as(leo, "select kind from email_outbox where kind = 'payment_received'")).length, 1);

  const [cancelled] = await as<{ status: string }>(
    leo,
    "update bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'staff' where id = $1 returning status",
    [ledBooking],
  );
  assertEquals(cancelled.status, "cancelled");
  await assertRejects(
    () => as(leo, "update bookings set cancel_reason = null where id = $1", [ledBooking]),
    Error,
    "Leaders can only",
  );
  await assertRejects(
    () => as(leo, "update bookings set status = 'confirmed' where id = $1", [ledBooking]),
    Error,
    "Leaders can only",
  );

  assertEquals(
    (await as(leo, "update bookings set payment_status = 'paid' where id = $1 returning id", [otherBooking])).length,
    0,
  );
});

Deno.test("leaders can't change booking details", async () => {
  const { as, ledBooking } = await setup();
  for (
    const change of [
      "email = 'evil@example.com'",
      "contact_name = 'x'",
      "attendees = '{a,b,c}'",
      "amount_cents = 0",
      "paid_at = now()",
      "status = 'waitlisted'",
      "cancel_reason = 'participant'",
    ]
  ) {
    await assertRejects(
      () => as(leo, `update bookings set ${change} where id = $1`, [ledBooking]),
      Error,
      "Leaders can only",
      change,
    );
  }
});

Deno.test("leaders approve or hide their album files but change nothing else", async () => {
  const { as, ledMedia } = await setup();
  const [row] = await as<{ status: string }>(
    leo,
    "update media set status = 'approved' where id = $1 returning status",
    [ledMedia],
  );
  assertEquals(row.status, "approved");
  await assertRejects(
    () => as(leo, "update media set name = 'x' where id = $1", [ledMedia]),
    Error,
    "Leaders can only",
  );
  await assertRejects(() =>
    as(leo, "delete from media where id = $1 returning id", [ledMedia]).then((r) => {
      if (r.length === 0) throw new Error("not deleted");
    })
  );
});

Deno.test("a leader who is removed from the team loses access", async () => {
  const { as } = await setup();
  await as(admin, "delete from staff_roles where email = 'leo@gmail.com'");
  assertEquals((await as(leo, "select id from bookings")).length, 0);
  assertEquals((await as(leo, "select id from events")).length, 0);
});

Deno.test("members (no role) see no staff data", async () => {
  const { as } = await setup();
  assertEquals((await as(mary, "select id from events")).length, 0); // both events are drafts
  assertEquals((await as(mary, "select id from bookings")).length, 0);
  assertEquals((await as(mary, "select id from media")).length, 0);
  assertEquals((await as(mary, "select * from email_outbox")).length, 0);
});

Deno.test("sign-up allows email codes for anyone and Google only for the Workspace domain", async () => {
  const { db } = await setup();
  const check = async (email: string, provider: string) =>
    (await db.query<{ r: Record<string, unknown> }>(
      "select public.enforce_azo_workspace_signup($1::jsonb) as r",
      [JSON.stringify({ user: { email, app_metadata: { provider } } })],
    )).rows[0].r;
  assertEquals(await check("mary@gmail.com", "email"), {});
  assertEquals(await check("olga@activezoneoutdoor.cy", "google"), {});
  assert("error" in await check("mary@gmail.com", "google"));
  assert("error" in await check("mary@gmail.com", "phone"));
});
