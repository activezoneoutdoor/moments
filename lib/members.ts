// Member accounts: data access and display helpers shared by the Profile and Members sections of My account (/account/).
// Row level security decides what each user may read or change (supabase/migrations/20261010000000_members.sql and
// 20261012000000_member_accounts.sql);
// nothing here is trusted for access control.
import type { SupabaseClient } from "@supabase/supabase-js";

export type MemberStatus = "online" | "registered" | "former";
export type PaymentMethod = "cash" | "bank_transfer" | "card" | "other";

export type Member = {
  id: string;
  /** Contact email. The emails people sign in with are their sign-ins (member_accounts). */
  email: string | null;
  full_name: string;
  phone: string | null;
  status: MemberStatus;
  member_number: string | null;
  registered_on: string | null;
  created_at: string;
};

export type MembershipYear = { member_id?: string; year: number; fee: number | null; paid: number };
export type Payment = {
  id: string;
  year: number;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
};
export type Fee = { year: number; amount: number };
/** A sign-in (Supabase account) linked to a member. */
export type SignIn = { user_id: string; email: string | null; linked_at: string };

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message || "Something went wrong.");
  return data as T;
}

// PostgREST returns numeric columns as numbers or strings depending on size; normalise them.
const num = (v: unknown) => (v == null ? null : Number(v));

// ---------- Member ----------

/**
 * The signed-in person's member record (team members included), created on first sign-in. With a link token from
 * startAccountLink, this sign-in is linked to that member instead; that throws a readable error if it can't be.
 */
export async function claimMembership(supabase: SupabaseClient, linkToken?: string): Promise<Member | null> {
  const row = unwrap(await supabase.rpc("claim_membership", linkToken ? { p_link_token: linkToken } : {})) as Member | null;
  return row?.id ? row : null;
}

/** Starts linking another email to the signed-in member. The token is valid for 30 minutes, once. */
export async function startAccountLink(supabase: SupabaseClient): Promise<string> {
  return unwrap(await supabase.rpc("start_account_link")) as string;
}

/** The sign-ins linked to a member, oldest first. Members see their own; staff see everyone's. */
export async function listSignIns(supabase: SupabaseClient, memberId: string): Promise<SignIn[]> {
  return unwrap(await supabase.from("member_accounts").select("user_id, email, linked_at").eq("member_id", memberId)
    .order("linked_at")) as SignIn[];
}

/** Unlinks a sign-in. Its next sign-in then gets a new online member record. */
export async function unlinkSignIn(supabase: SupabaseClient, userId: string): Promise<void> {
  const rows = unwrap(await supabase.from("member_accounts").delete().eq("user_id", userId).select("user_id")) as unknown[];
  if (rows.length === 0) throw new Error("That sign-in couldn't be removed.");
}

export async function updateProfile(supabase: SupabaseClient, id: string, fields: { full_name: string; phone: string | null }): Promise<Member> {
  return unwrap(await supabase.from("members").update(fields).eq("id", id).select().single()) as Member;
}

/** Fee and amount paid for each membership year, newest first. */
export async function membershipYears(supabase: SupabaseClient, memberId: string): Promise<MembershipYear[]> {
  const rows = unwrap(await supabase.from("membership_years").select("year, fee, paid").eq("member_id", memberId)
    .order("year", { ascending: false })) as MembershipYear[];
  return rows.map((r) => ({ ...r, fee: num(r.fee), paid: num(r.paid) ?? 0 }));
}

export async function payments(supabase: SupabaseClient, memberId: string): Promise<Payment[]> {
  const rows = unwrap(await supabase.from("membership_payments").select("id, year, amount, paid_on, method, reference")
    .eq("member_id", memberId).order("paid_on", { ascending: false }).order("created_at", { ascending: false })) as Payment[];
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

// ---------- Staff ----------

export async function listMembers(supabase: SupabaseClient): Promise<Member[]> {
  return unwrap(await supabase.from("members").select("*").order("full_name").order("email")) as Member[];
}

/** Inserts a new member (no id) or updates one. */
export async function saveMember(supabase: SupabaseClient, { id, ...fields }: Partial<Member> & { id?: string }): Promise<Member> {
  const query = id ? supabase.from("members").update(fields).eq("id", id) : supabase.from("members").insert(fields);
  return unwrap(await query.select().single()) as Member;
}

/** Merges `removeId` into `keepId`: sign-ins and payments move over, and `removeId` is deleted. */
export async function mergeMembers(supabase: SupabaseClient, keepId: string, removeId: string): Promise<Member> {
  return unwrap(await supabase.rpc("merge_members", { p_keep: keepId, p_remove: removeId })) as Member;
}

export async function deleteMember(supabase: SupabaseClient, id: string): Promise<void> {
  unwrap(await supabase.from("members").delete().eq("id", id));
}

/** Every member's fee and amount paid for one year. */
export async function yearSummary(supabase: SupabaseClient, year: number): Promise<MembershipYear[]> {
  const rows = unwrap(await supabase.from("membership_years").select("member_id, year, fee, paid").eq("year", year)) as MembershipYear[];
  return rows.map((r) => ({ ...r, fee: num(r.fee), paid: num(r.paid) ?? 0 }));
}

export async function addPayment(supabase: SupabaseClient, payment: Omit<Payment, "id"> & { member_id: string }): Promise<void> {
  unwrap(await supabase.from("membership_payments").insert(payment));
}

export async function deletePayment(supabase: SupabaseClient, id: string): Promise<void> {
  unwrap(await supabase.from("membership_payments").delete().eq("id", id));
}

export async function listFees(supabase: SupabaseClient): Promise<Fee[]> {
  const rows = unwrap(await supabase.from("membership_fees").select("year, amount").order("year", { ascending: false })) as Fee[];
  return rows.map((r) => ({ year: r.year, amount: Number(r.amount) }));
}

export async function saveFee(supabase: SupabaseClient, year: number, amount: number): Promise<void> {
  unwrap(await supabase.from("membership_fees").upsert({ year, amount }));
}

export async function deleteFee(supabase: SupabaseClient, year: number): Promise<void> {
  unwrap(await supabase.from("membership_fees").delete().eq("year", year));
}

// ---------- Display ----------

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
export const money = (value: number | null | undefined) => (value == null ? "—" : euro.format(Number(value)));

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
export const thisYear = () => new Date().getFullYear();

export const statusLabels: Record<MemberStatus, string> = {
  online: "Online account",
  registered: "Registered member",
  former: "Former member",
};

export const methodLabels: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export type YearStatus = "paid" | "partial" | "due" | "unset";

/** Payment status of one year: paid, partly paid, due, or no fee set (and nothing paid). */
export function yearStatus(fee: number | null, paid: number): YearStatus {
  if (fee == null) return paid > 0 ? "paid" : "unset";
  if (paid >= fee) return "paid";
  return paid > 0 ? "partial" : "due";
}

export const yearStatusLabels: Record<YearStatus, string> = {
  paid: "Paid",
  partial: "Partly paid",
  due: "Due",
  unset: "Fee not set",
};
