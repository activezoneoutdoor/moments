"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatDate, membershipYears, methodLabels, money, payments as fetchPayments, statusLabels, thisYear, updateProfile,
  yearStatus, yearStatusLabels, type Member, type MembershipYear, type Payment, type YearStatus,
} from "@/lib/members";

const yearTone: Record<YearStatus, string> = { paid: "good", partial: "warn", due: "bad", unset: "muted" };

const explain: Record<Member["status"], string> = {
  online: "You have an online account. To become a registered member of Active Zone Outdoor, contact us and we'll register you.",
  registered: "You're a registered member of Active Zone Outdoor. Thank you for being part of the team!",
  former: "You're no longer a registered member. Contact us any time to renew your membership.",
};

/** A member's own profile: membership status, editable details and yearly membership payments. */
export function ProfilePanel({ supabase, member, email, onSaved }: {
  supabase: SupabaseClient;
  member: Member;
  email: string;
  onSaved: (member: Member) => void;
}) {
  const [years, setYears] = useState<MembershipYear[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const current = years?.find((y) => y.year === thisYear());

  useEffect(() => {
    Promise.all([membershipYears(supabase, member.id), fetchPayments(supabase, member.id)])
      .then(([y, p]) => { setYears(y); setPayments(p); })
      .catch((err: unknown) => { setYears([]); setLoadError(err instanceof Error ? err.message : String(err)); });
  }, [supabase, member.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setMessage({ text: "Please enter your name.", ok: false });
    setSaving(true);
    setMessage(null);
    try {
      onSaved(await updateProfile(supabase, member.id, { full_name: name.trim(), phone: phone.trim() || null }));
      setMessage({ text: "Your details were saved.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-grid">
      <section className="panel" aria-labelledby="status-title">
        <h2 id="status-title">Membership</h2>
        <p className={`status-hero status-${member.status}`}>
          <span className={`badge badge-${member.status === "registered" ? "good" : member.status === "online" ? "neutral" : "muted"}`}>{statusLabels[member.status]}</span>
        </p>
        <dl className="facts">
          {member.member_number && <><dt>Member no.</dt><dd>{member.member_number}</dd></>}
          {member.registered_on && <><dt>Member since</dt><dd>{formatDate(member.registered_on)}</dd></>}
          {member.status === "registered" && (
            <><dt>{thisYear()} membership</dt><dd>{current ? <YearBadge status={yearStatus(current.fee, current.paid)} /> : "—"}</dd></>
          )}
        </dl>
        <p className="muted">{explain[member.status]}</p>
        {member.status !== "registered" && <a className="btn btn-outline btn-sm" href="/#contact">Contact us</a>}
      </section>

      <section className="panel" aria-labelledby="profile-title">
        <h2 id="profile-title">Your details</h2>
        <form className="stack" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor="p-name">Full name</label>
            <input id="p-name" autoComplete="name" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} aria-invalid={message && !message.ok && !name.trim() ? true : undefined} />
          </div>
          <div className="field">
            <label htmlFor="p-email">Email</label>
            <input id="p-email" type="email" readOnly value={member.email ?? email} aria-describedby="p-email-help" />
            <small id="p-email-help" className="muted">You sign in with this email. Ask us if it needs to change.</small>
          </div>
          <div className="field">
            <label htmlFor="p-phone">Mobile phone</label>
            <input id="p-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="+357 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
          {message && <p className={message.ok ? "form-ok" : "account-error"} role="status">{message.text}</p>}
        </form>
      </section>

      <section className="panel panel-wide" aria-labelledby="payments-title">
        <h2 id="payments-title">Yearly membership payments</h2>
        {loadError && <p className="account-error" role="alert">{loadError}</p>}
        {years === null ? <p className="empty">Loading…</p> : years.length === 0 && payments.length === 0 ? (
          <p className="empty">{member.status === "registered"
            ? "No membership years yet. Your yearly fees will appear here."
            : "Yearly membership payments appear here once you're a registered member."}</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Year</th><th>Fee</th><th>Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.year}><td>{y.year}</td><td>{money(y.fee)}</td><td>{money(y.paid)}</td><td><YearBadge status={yearStatus(y.fee, y.paid)} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments.length > 0 && (
              <details className="history">
                <summary>Payment history ({payments.length})</summary>
                <ul className="payment-list">
                  {payments.map((p) => (
                    <li key={p.id}>
                      <strong>{money(p.amount)}</strong> for {p.year} · {formatDate(p.paid_on)} · {methodLabels[p.method] ?? p.method}
                      {p.reference && <span className="muted"> · {p.reference}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function YearBadge({ status }: { status: YearStatus }) {
  return <span className={`badge badge-${yearTone[status]}`}>{yearStatusLabels[status]}</span>;
}
