"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addPayment, deleteFee, deleteMember, deletePayment, formatDate, listFees, listMembers, membershipYears, methodLabels,
  money, payments as fetchPayments, saveFee, saveMember, statusLabels, thisYear, today, yearStatus, yearStatusLabels, yearSummary,
  type Fee, type Member, type MembershipYear, type MemberStatus, type Payment, type PaymentMethod, type YearStatus,
} from "@/lib/members";

const yearPill: Record<YearStatus, string> = { paid: "status-published", partial: "status-draft", due: "status-cancelled", unset: "" };
const statusPill: Record<MemberStatus, string> = { registered: "status-published", online: "", former: "status-archived" };

/**
 * Staff (admin and staff roles): register members, set their status, record yearly payments and set the yearly
 * fee. The database enforces who may do this (members migration); leaders never see this section.
 */
export function MembersPanel({ supabase }: { supabase: SupabaseClient }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Map<string, MembershipYear>>(new Map());
  const [fees, setFees] = useState<Fee[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MemberStatus | "">("");
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [feesOpen, setFeesOpen] = useState(false);
  const [error, setError] = useState("");
  const year = thisYear();

  const refresh = useCallback(async () => {
    try {
      const [m, s, f] = await Promise.all([listMembers(supabase), yearSummary(supabase, year), listFees(supabase)]);
      setMembers(m);
      setSummary(new Map(s.map((r) => [r.member_id!, r])));
      setFees(f);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [supabase, year]);

  useEffect(() => { void refresh(); }, [refresh]);

  const thisYearStatus = (m: Member): YearStatus | null => {
    const row = summary.get(m.id);
    if (row) return yearStatus(row.fee, row.paid);
    return m.status === "registered" ? "due" : null;
  };

  const registered = members.filter((m) => m.status === "registered");
  const paid = registered.filter((m) => thisYearStatus(m) === "paid").length;
  const q = query.trim().toLowerCase();
  const rows = members.filter((m) =>
    (!status || m.status === status) &&
    (!q || [m.full_name, m.email, m.phone, m.member_number].some((v) => v?.toLowerCase().includes(q)))
  );

  return (
    <section className="album-section members-panel">
      <div className="section-heading">
        <div><p className="eyebrow">MEMBERS</p><h2>Members &amp; yearly fees</h2></div>
        <div className="panel-actions">
          <button className="ghost-button" onClick={() => setFeesOpen(true)}>Yearly fees</button>
          <button className="primary-button" onClick={() => setEditing("new")}>+ Add member</button>
        </div>
      </div>
      {error && <p className="panel-message warn" role="alert">{error}</p>}

      <ul className="member-stats" aria-label="Summary">
        <li><b>{registered.length}</b><span>Registered members</span></li>
        <li><b>{members.filter((m) => m.status === "online").length}</b><span>Online accounts</span></li>
        <li><b>{paid}</b><span>Paid {year}</span></li>
        <li><b>{registered.length - paid}</b><span>Not paid {year}</span></li>
      </ul>

      <div className="member-toolbar">
        <label className="visually-hidden" htmlFor="member-search">Search members</label>
        <input id="member-search" type="search" placeholder="Search name, email, phone or member no." value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="visually-hidden" htmlFor="member-status">Status</label>
        <select id="member-status" value={status} onChange={(e) => setStatus(e.target.value as MemberStatus | "")}>
          <option value="">All statuses</option>
          <option value="registered">Registered members</option>
          <option value="online">Online accounts</option>
          <option value="former">Former members</option>
        </select>
      </div>

      <div className="booking-list member-list">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Member no.</th><th>{year}</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((m) => {
              const ys = thisYearStatus(m);
              return (
                <tr key={m.id}>
                  <td className="booking-who"><b>{m.full_name || "(no name)"}</b><span>{[m.email, m.phone].filter(Boolean).join(" · ") || "—"}</span></td>
                  <td><span className={`pill ${statusPill[m.status]}`}>{statusLabels[m.status]}</span></td>
                  <td>{m.member_number ?? "—"}</td>
                  <td>{ys ? <span className={`pill ${yearPill[ys]}`}>{yearStatusLabels[ys]}</span> : "—"}</td>
                  <td className="member-open"><button className="ghost-button" onClick={() => setEditing(m)}>Open</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="empty-state">{members.length ? "No members match." : "No members yet. They appear here when they sign in on the website, or when you add them."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="form-hint">Showing {rows.length} of {members.length} member{members.length === 1 ? "" : "s"}.</p>

      {editing && (
        <MemberDialog
          key={editing === "new" ? "new" : editing.id}
          supabase={supabase}
          member={editing === "new" ? null : editing}
          fees={fees}
          onClose={() => setEditing(null)}
          onChanged={async (next) => { await refresh(); if (next !== undefined) setEditing(next); }}
        />
      )}
      {feesOpen && <FeesDialog supabase={supabase} fees={fees} onClose={() => setFeesOpen(false)} onChanged={refresh} />}
    </section>
  );
}

/** A native modal dialog, opened on mount. */
function Dialog({ title, onClose, children, narrow = false }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className={narrow ? "admin-dialog narrow" : "admin-dialog"} aria-label={title} onClose={onClose} onCancel={onClose}>
      <button className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

function MemberDialog({ supabase, member, fees, onClose, onChanged }: {
  supabase: SupabaseClient;
  member: Member | null;
  fees: Fee[];
  onClose: () => void;
  /** Called after a change; with a member to keep the dialog on it, or null to close. */
  onChanged: (next?: Member | null) => Promise<void>;
}) {
  const [form, setForm] = useState({
    full_name: member?.full_name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    status: member?.status ?? ("registered" as MemberStatus),
    member_number: member?.member_number ?? "",
    // Date inputs need YYYY-MM-DD; take just the date part whatever format the API returns.
    registered_on: member?.registered_on?.slice(0, 10) ?? (member ? "" : today()),
  });
  const [years, setYears] = useState<MembershipYear[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const linked = Boolean(member?.user_id);

  const loadPayments = useCallback(async () => {
    if (!member) return;
    const [y, p] = await Promise.all([membershipYears(supabase, member.id), fetchPayments(supabase, member.id)]);
    setYears(y);
    setPayments(p);
  }, [supabase, member]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  async function act(task: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({ text: done, warn: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), warn: true });
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!form.full_name.trim()) return setMessage({ text: "Please enter a name.", warn: true });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage({ text: "Please enter a valid email, or leave it empty.", warn: true });
    void act(async () => {
      const saved = await saveMember(supabase, {
        id: member?.id,
        full_name: form.full_name.trim(),
        ...(linked ? {} : { email: email || null }),
        phone: form.phone.trim() || null,
        status: form.status,
        member_number: form.member_number.trim() || null,
        registered_on: form.registered_on || null,
      });
      await onChanged(saved);
    }, member ? "Member saved." : "Member added. You can record payments now.");
  };

  const remove = () => {
    if (!member) return;
    const who = member.full_name || member.email || "this member";
    if (!window.confirm(linked
      ? `Delete ${who}? Their payment records are deleted too. If they sign in again they get a new online account.`
      : `Delete ${who} and their payment records?`)) return;
    void act(async () => { await deleteMember(supabase, member.id); await onChanged(null); }, "Member deleted.");
  };

  return (
    <Dialog title={member ? member.full_name || "Member" : "Add member"} onClose={onClose}>
      <form className="event-form member-form" onSubmit={save} noValidate>
        <div className="form-grid">
          <label className="span-2">Full name
            <input required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label>Email
            <input type="email" maxLength={254} value={form.email} readOnly={linked} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <small>{linked ? "Linked to their sign-in." : "They sign in with a code sent to this email."}</small>
          </label>
          <label>Mobile phone
            <input type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MemberStatus })}>
              <option value="registered">Registered member</option>
              <option value="online">Online account</option>
              <option value="former">Former member</option>
            </select>
          </label>
          <label>Member no.
            <input maxLength={30} value={form.member_number} onChange={(e) => setForm({ ...form, member_number: e.target.value })} />
          </label>
          <label>Registered on
            <input type="date" value={form.registered_on} onChange={(e) => setForm({ ...form, registered_on: e.target.value })} />
          </label>
        </div>
        <div className="dialog-actions">
          {member && <button className="ghost-button danger" type="button" disabled={busy} onClick={remove}>Delete member</button>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
      {message && <p className={message.warn ? "panel-message warn" : "panel-message"} role="status">{message.text}</p>}

      {member && (
        <section className="dialog-section">
          <p className="eyebrow">PAYMENTS</p>
          {years.length ? (
            <ul className="year-chips">
              {years.map((y) => {
                const s = yearStatus(y.fee, y.paid);
                return <li key={y.year}><b>{y.year}</b><span className={`pill ${yearPill[s]}`}>{yearStatusLabels[s]}</span><small>{money(y.paid)} of {money(y.fee)}</small></li>;
              })}
            </ul>
          ) : <p className="form-hint">No membership years yet. Set a registration date to start tracking fees.</p>}
          <PaymentForm supabase={supabase} memberId={member.id} fees={fees} onRecorded={async () => { await loadPayments(); await onChanged(); }} />
          {payments.length ? (
            <ul className="payment-rows">
              {payments.map((p) => (
                <li key={p.id}>
                  <span><b>{money(p.amount)}</b> for {p.year} · {formatDate(p.paid_on)} · {methodLabels[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <button className="link-button danger-link" disabled={busy} aria-label={`Delete payment of ${money(p.amount)} for ${p.year}`}
                    onClick={() => {
                      if (!window.confirm(`Delete the ${money(p.amount)} payment for ${p.year}?`)) return;
                      void act(async () => { await deletePayment(supabase, p.id); await loadPayments(); await onChanged(); }, "Payment deleted.");
                    }}>Delete</button>
                </li>
              ))}
            </ul>
          ) : <p className="form-hint">No payments recorded.</p>}
        </section>
      )}
    </Dialog>
  );
}

/** Records a payment. The amount is pre-filled with the year's fee, but never overwrites what staff typed. */
function PaymentForm({ supabase, memberId, fees, onRecorded }: {
  supabase: SupabaseClient; memberId: string; fees: Fee[]; onRecorded: () => Promise<void>;
}) {
  const feeFor = (y: number) => fees.find((f) => f.year === y)?.amount;
  const initialFee = feeFor(thisYear());
  const [year, setYear] = useState(String(thisYear()));
  const [amount, setAmount] = useState(initialFee != null ? String(initialFee) : "");
  const [suggested, setSuggested] = useState(initialFee != null ? String(initialFee) : "");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);

  const changeYear = (value: string) => {
    setYear(value);
    if (amount !== "" && amount !== suggested) return; // staff typed their own amount
    const fee = feeFor(Number(value));
    const next = fee != null ? String(fee) : "";
    setSuggested(next);
    setAmount(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const y = Number(year);
    const a = Number(amount);
    if (!Number.isInteger(y) || y < 2019 || y > 2100 || !(a > 0) || !paidOn) {
      return setMessage({ text: "Enter a year, an amount above 0 and the payment date.", warn: true });
    }
    setBusy(true);
    setMessage(null);
    try {
      await addPayment(supabase, { member_id: memberId, year: y, amount: a, paid_on: paidOn, method, reference: reference.trim() || null });
      setMessage({ text: `Payment of ${money(a)} recorded.`, warn: false });
      setReference("");
      const fee = feeFor(y);
      setSuggested(fee != null ? String(fee) : "");
      setAmount(fee != null ? String(fee) : "");
      await onRecorded();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="event-form payment-form" onSubmit={submit} noValidate>
      <label>Year<input type="number" min={2019} max={2100} value={year} onChange={(e) => changeYear(e.target.value)} /></label>
      <label>Amount (€)<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Paid on<input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
      <label>Method
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(Object.keys(methodLabels) as PaymentMethod[]).map((m) => <option key={m} value={m}>{methodLabels[m]}</option>)}
        </select>
      </label>
      <label className="span-3">Reference<input maxLength={100} placeholder="Receipt no., note…" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
      {message && <p className={message.warn ? "panel-message warn span-all" : "panel-message span-all"} role="status">{message.text}</p>}
    </form>
  );
}

function FeesDialog({ supabase, fees, onClose, onChanged }: {
  supabase: SupabaseClient; fees: Fee[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const current = fees.find((f) => f.year === thisYear());
  const [year, setYear] = useState(String(thisYear()));
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);

  async function act(task: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      await onChanged();
      setMessage({ text: done, warn: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), warn: true });
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const y = Number(year);
    const a = Number(amount);
    if (!Number.isInteger(y) || y < 2019 || y > 2100 || amount === "" || a < 0) {
      return setMessage({ text: "Enter a year and a fee of 0 or more.", warn: true });
    }
    void act(() => saveFee(supabase, y, a), `${y} fee set to ${money(a)}.`);
  };

  return (
    <Dialog title="Yearly membership fees" onClose={onClose} narrow>
      <p className="form-hint">The fee registered members owe each year. Years without a fee show “Fee not set”.</p>
      <form className="event-form payment-form fee-form" onSubmit={submit} noValidate>
        <label>Year<input type="number" min={2019} max={2100} value={year} onChange={(e) => setYear(e.target.value)} /></label>
        <label>Fee (€)<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={busy}>Save fee</button>
      </form>
      {message && <p className={message.warn ? "panel-message warn" : "panel-message"} role="status">{message.text}</p>}
      {fees.length ? (
        <ul className="payment-rows">
          {fees.map((f) => (
            <li key={f.year}>
              <span><b>{f.year}</b> · {money(f.amount)}</span>
              <button className="link-button danger-link" disabled={busy} aria-label={`Delete the ${f.year} fee`}
                onClick={() => { if (window.confirm(`Delete the ${f.year} fee?`)) void act(() => deleteFee(supabase, f.year), `${f.year} fee deleted.`); }}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="form-hint">No fees set yet.</p>}
    </Dialog>
  );
}
