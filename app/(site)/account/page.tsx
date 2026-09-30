"use client";

import { useState, type FormEvent } from "react";
import { roleLabels, useAccountSession, workspaceDomain, type TeamRole } from "@/lib/auth";
import { AccountSections } from "@/app/components/account/AccountSections";
import { SiteBehaviour } from "@/app/components/site/SiteBehaviour";
import { SiteFooter } from "@/app/components/site/SiteFooter";
import { SiteHeader } from "@/app/components/site/SiteHeader";
import "./account.css";

const intro: Record<TeamRole, string> = {
  admin: "Events, albums, members and the team.",
  staff: "Events, albums and members.",
  leader: "The events you lead and your profile.",
};

/**
 * My account: one place for members and the team. Everyone signs in here; members see their profile, and team
 * members (admin, staff, leader) also get the sections their role allows.
 */
export default function AccountPage() {
  const { supabase, session, role, member, setMember, checking, notice, signInWithGoogle, sendCode, verifyCode, signOut } = useAccountSession();
  const email = session?.user.email ?? "";
  const name = member?.full_name || session?.user.user_metadata.full_name || session?.user.user_metadata.name || "";
  const firstName = String(name).split(" ")[0];

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader solid current="account" />
      <main id="main" className="account-main">
        <div className="container">
          {!supabase ? (
            <section className="auth-card">
              <h1>My account is coming soon</h1>
              <p>Sign-in isn&apos;t connected yet. Please check back soon, or <a href="/#contact">contact us</a>.</p>
            </section>
          ) : checking ? (
            <p className="account-loading">Loading…</p>
          ) : !session ? (
            <SignIn notice={notice} sendCode={sendCode} verifyCode={verifyCode} signInWithGoogle={signInWithGoogle} />
          ) : (
            <>
              <div className="app-head">
                <div>
                  <h1>{firstName ? `Hi, ${firstName}` : "Welcome"}</h1>
                  <p className="account-who">
                    <span>{email}</span>
                    {role && <span className="badge badge-neutral">{roleLabels[role]}</span>}
                  </p>
                  {role && <p className="muted account-intro">{intro[role]}</p>}
                </div>
                <div className="actions">
                  <button className="btn btn-outline btn-sm" type="button" onClick={signOut}>Sign out</button>
                </div>
              </div>
              {!role && !member ? (
                <p className="account-error" role="alert">We couldn&apos;t open your account. Please sign out and try again, or contact us.</p>
              ) : (
                <AccountSections key={session.user.id} supabase={supabase} role={role} member={member} email={email} onMemberSaved={setMember} />
              )}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}

function SignIn({ notice, sendCode, verifyCode, signInWithGoogle }: {
  notice: string;
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (!sent) setSent(await sendCode(email));
      else await verifyCode(email, code);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-card">
      <img src="/assets/img/logo-official-160.png" alt="" width="88" height="88" />
      <h1>My account</h1>
      <p>Members and the Active Zone Outdoor team sign in here. Members see their membership and yearly payments; the team manages events, albums and members.</p>
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
      <div className="team-sign-in">
        <p className="muted small">Team with an <strong>@{workspaceDomain}</strong> account</p>
        <button className="btn btn-outline btn-block" type="button" onClick={() => void signInWithGoogle()}>
          <GoogleMark /> Continue with Google
        </button>
      </div>
    </section>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2C14.4 15.4 18.8 11.9 24 11.9Z"/></svg>;
}
