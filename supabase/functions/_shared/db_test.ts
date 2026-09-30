import { assertEquals, assertRejects } from "@std/assert";
import { requireStaff, requireStaffOrEventLeader } from "./db.ts";
import { HttpError } from "./http.ts";

Deno.env.set("SUPABASE_URL", "https://project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

// Fake Supabase: sessions by token, the staff_roles table and events' leader emails.
const sessions: Record<string, string> = {
  "t-admin": "achernar@activezoneoutdoor.cy",
  "t-staff": "olga@activezoneoutdoor.cy",
  "t-domain-no-role": "newbie@activezoneoutdoor.cy",
  "t-leader": "Leo@Gmail.com",
  "t-member": "mary@gmail.com",
};
const roles: Record<string, string> = {
  "achernar@activezoneoutdoor.cy": "admin",
  "olga@activezoneoutdoor.cy": "staff",
  "leo@gmail.com": "leader",
};
const events: Record<string, string> = { "event-led": " leo@gmail.com", "event-other": "x@gmail.com" };

function row(req: Request, value: Record<string, unknown> | null): Response {
  // supabase-js asks for a single object with this Accept header; otherwise PostgREST returns an array.
  if (req.headers.get("accept")?.includes("vnd.pgrst.object")) {
    return value ? Response.json(value) : Response.json({ message: "no rows" }, { status: 406 });
  }
  return Response.json(value ? [value] : []);
}

function fakeSupabase(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.pathname === "/auth/v1/user") {
    const email = sessions[req.headers.get("authorization")?.replace("Bearer ", "") ?? ""];
    return Promise.resolve(
      email ? Response.json({ id: "u", email, aud: "authenticated" }) : Response.json({ msg: "bad jwt" }, { status: 401 }),
    );
  }
  if (url.pathname === "/rest/v1/staff_roles") {
    const email = url.searchParams.get("email")?.replace(/^eq\./, "") ?? "";
    return Promise.resolve(row(req, roles[email] ? { role: roles[email] } : null));
  }
  if (url.pathname === "/rest/v1/events") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
    return Promise.resolve(row(req, id in events ? { leader_email: events[id] } : null));
  }
  return Promise.resolve(new Response("unexpected " + url.pathname, { status: 500 }));
}

/** Runs a test with fetch pointed at the fake Supabase (other test files replace fetch too). */
function withFake(test: () => Promise<void>, fake: typeof fetch = fakeSupabase): () => Promise<void> {
  return async () => {
    const real = globalThis.fetch;
    globalThis.fetch = fake;
    try {
      await test();
    } finally {
      globalThis.fetch = real;
    }
  };
}

const call = (token?: string) =>
  new Request("https://fn.example/", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function outcome(check: Promise<void>): Promise<number> {
  try {
    await check;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
}

Deno.test("requireStaff accepts admin and staff roles only", withFake(async () => {
  assertEquals(await outcome(requireStaff(call("t-admin"))), 200);
  assertEquals(await outcome(requireStaff(call("t-staff"))), 200);
  for (const token of ["t-domain-no-role", "t-leader", "t-member", "t-invalid", undefined]) {
    assertEquals(await outcome(requireStaff(call(token))), 403, String(token));
  }
}));

Deno.test("requireStaffOrEventLeader lets leaders into the events they lead only", withFake(async () => {
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-staff"), "event-other")), 200);
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-leader"), "event-led")), 200);
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-leader"), "event-other")), 403);
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-leader"), "missing")), 403);
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-member"), "event-led")), 403);
  assertEquals(await outcome(requireStaffOrEventLeader(call("t-domain-no-role"), "event-led")), 403);
}));

Deno.test(
  "a database error is not mistaken for 'no role'",
  withFake(async () => {
    await assertRejects(() => requireStaff(call("t-staff")));
  }, (input, init) => {
    const url = new URL(new Request(input, init).url);
    return url.pathname === "/rest/v1/staff_roles"
      ? Promise.resolve(Response.json({ message: "db down" }, { status: 500 }))
      : fakeSupabase(input, init);
  }),
);
