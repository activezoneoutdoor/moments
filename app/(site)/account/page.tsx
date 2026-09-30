"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { fetchTeamRole, type TeamRole } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  claimMembership, formatDate, membershipYears, methodLabels, money, payments as fetchPayments, statusLabels, thisYear,
  updateProfile, yearStatus, yearStatusLabels, type Member, type MembershipYear, type Payment, type YearStatus,
} from "@/lib/members";
import { SiteBehaviour } from "@/app/components/site/SiteBehaviour";
import { SiteFooter } from "@/app/components/site/SiteFooter";
import { SiteHeader } from "@/app/components/site/SiteHeader";
import "./account.css";

type View =
  | { kind: "loading" }
  | { kind: "not-configured" }
  | { kind: "signed-out" }
  | { kind: "staff"; session: Session }
  | { kind: "member"; session: Session; role: TeamRole | null; member: Member; years: MembershipYear[]; payments: Payment[] };

const yearTone: Record<YearStatus, string> = { paid: "good", partial: "warn", due: "bad", unset: "muted" };

/** Members area: sign in with an email code, see membership status, edit details, follow yearly payments. */
export default function AccountPage() {
  const [supabase] = useState(() => getSupabaseBrowserClient());
  const [view, setView] = useState<View>({ kind: "loading" });
  const [error, setError] = useState("");

  const load = useCallback(async (client: SupabaseClient, session: Session | null) => {
    if (!session) return setView({ kind: "signed-out" });
    setView({ kind: "loading" });
    try {
      const role = await fetchTeamRole(client);
      if (role === "admin" || role === "staff") return setView({ kind: "staff", session });
      const member = await claimMembership(client);
      if (!member) return setView({ kind: "signed-out" });
      const [years, payments] = await Promise.all([membershipYears(client, member.id), fetchPayments(client, member.id)]);
      setView({ kind: "member", session, role, member, years, payments });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setView({ kind: "signed-out" });
    }
  }, []);

  useEffect(() => {
    if (!supabase) return setView({ kind: "not-configured" });
    let shown: string | null | undefined;
    const show = (session: Session | null) => {
      const id = session?.user.id ?? null;
      if (id === shown) return;
      shown = id;
      void load(supabase, session);
    };
    void supabase.auth.getSession().then(({ data }) => show(data.session));
    // Supabase calls must not run inside the auth callback itself, so loading is deferred.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => show(session), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase, load]);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setView({ kind: "signed-out" });
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader solid current="members" />
      <main id="main" className="account-main">
        <div className="container">
          {error && <p className="account-error" role="alert">{error}</p>}
          {view.kind === "loading" && <p className="account-loading">Loading…</p>}
          {view.kind === "not-configured" && (
            <section className="auth-card">
              <h1>Members area coming soon</h1>
              <p>The members area isn&apos;t connected yet. Please check back soon, or <a href="/#contact">contact us</a>.</p>
            </section>
          )}
          {view.kind === "signed-out" && supabase && <SignIn supabase={supabase} onError={setError} />}
          {view.kind === "staff" && (
            <section className="auth-card">
              <h1>You&apos;re signed in as staff</h1>
              <p>Staff accounts manage members, their status and payments in the admin.</p>
              <p className="actions">
                <a className="btn btn-primary" href="/admin/">Open the admin</a>
                <button className="btn btn-outline" type="button" onClick={signOut}>Sign out</button>
              </p>
            </section>
          )}
          {view.kind === "member" && supabase && (
            <MemberView
              supabase={supabase}
              view={view}
              onSaved={(member) => setView({ ...view, member })}
              onSignOut={signOut}
            />
          )}
        </div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}

function SignIn({ supabase, onError }: { supabase: SupabaseClient; onError: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    onError("");
    try {
      const address = email.trim().toLowerCase();
      if (!sent) {
        const { error } = await supabase.auth.signInWithOtp({ email: address });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.verifyOtp({ email: address, token: code.trim(), type: "email" });
        if (error) throw new Error(error.message === "Token has expired or is invalid" ? "That code is wrong or has expired. Request a new one." : error.message);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-card">
      <img src="/assets/img/logo-official-160.png" alt="" width="88" height="88" />
      <h1>Members area</h1>
      <p>See your membership status, keep your details up to date and follow your yearly membership payments.</p>
      <form className="code-form" onSubmit={submit}>
        {!sent ? (
          <div className="field">
            <label htmlFor="signin-email">Your email</label>
            <input id="signin-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="signin-code">We emailed a code to {email}</label>
            <input id="signin-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy} />
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Please wait…" : sent ? "Sign in" : "Email me a sign-in code"}
        </button>
        {sent && <button className="link-btn" type="button" onClick={() => { setSent(false); setCode(""); }}>Use another email</button>}
      </form>
      {notice && <p className="account-error" role="alert">{notice}</p>}
      <p className="muted small">New here? Signing in creates your online account. No password needed.</p>
    </section>
  );
}

function MemberView({ supabase, view, onSaved, onSignOut }: {
  supabase: SupabaseClient;
  view: Extract<View, { kind: "member" }>;
  onSaved: (member: Member) => void;
  onSignOut: () => void;
}) {
  const { member, years, payments, role, session } = view;
  const [name, setName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const firstName = member.full_name.split(" ")[0];
  const current = years.find((y) => y.year === thisYear());

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

  const explain: Record<Member["status"], string> = {
    online: "You have an online account. To become a registered member of Active Zone Outdoor, contact us and we'll register you.",
    registered: "You're a registered member of Active Zone Outdoor. Thank you for being part of the team!",
    former: "You're no longer a registered member. Contact us any time to renew your membership.",
  };

  return (
    <div>
      <div className="app-head">
        <div>
          <p className="eyebrow">Members area</p>
          <h1>{firstName ? `Hi, ${firstName}` : "Welcome"}</h1>
        </div>
        <div className="actions">
          {role === "leader" && <a className="btn btn-outline btn-sm" href="/admin/">Events you lead</a>}
          <button className="btn btn-outline btn-sm" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

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
              <input id="p-email" type="email" readOnly value={member.email ?? session.user.email ?? ""} aria-describedby="p-email-help" />
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
          {years.length === 0 && payments.length === 0 ? (
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
    </div>
  );
}

function YearBadge({ status }: { status: YearStatus }) {
  return <span className={`badge badge-${yearTone[status]}`}>{yearStatusLabels[status]}</span>;
}
