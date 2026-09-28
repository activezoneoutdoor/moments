"use client";

import { allowedDomain, useStaffSession } from "@/lib/auth";
import { Dashboard } from "../components/Dashboard";
import { publicHomeUrl, StaffTopbar } from "../components/Shell";

export default function AdminPage() {
  const { supabase, session, checking, notice, signIn, signOut } = useStaffSession();

  if (checking) return <main className="loading-shell"><span className="brand-mark">AZO</span><p>Opening AZO Moments…</p></main>;

  if (!session || !supabase) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">AZO</div>
          <p className="eyebrow">ACTIVE ZONE OUTDOOR</p>
          <h1>Your activities,<br />thoughtfully shared.</h1>
          <p className="intro">Plan events, collect participants&apos; photos and videos with one link, and publish each album on its public event page.</p>
          <button className="google-button" onClick={signIn} disabled={!supabase}>
            <GoogleMark /> Continue with Google <span aria-hidden="true">→</span>
          </button>
          {!supabase && <p className="config-note">Add your Supabase project URL and publishable key to enable sign-in.</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <p className="access-note"><span className="lock-icon">●</span> Sign in with your Active Zone Outdoor Google Workspace account</p>
          <p className="domain-note">Access is limited to <strong>@{allowedDomain}</strong></p>
          <a className="back-link" href={publicHomeUrl}>← Back to events</a>
        </section>
        <aside className="visual-panel" aria-label="AZO Moments introduction">
          <div className="sun"></div>
          <div className="mountain mountain-back"></div>
          <div className="mountain mountain-front"></div>
          <div className="photo-caption"><span>AZO MOMENTS · EVENTS & ALBUMS</span><b>Stories made to be shared.</b></div>
          <div className="image-credit">ACTIVE ZONE OUTDOOR · CYPRUS</div>
        </aside>
      </main>
    );
  }

  const fullName = session.user.user_metadata.full_name ?? session.user.user_metadata.name ?? "";
  const firstName = fullName.split(" ")[0];

  return (
    <main className="workspace-shell">
      <StaffTopbar session={session} onSignOut={signOut} />
      <section className="welcome">
        <p className="eyebrow">AZO MOMENTS · YOUR WORKSPACE</p>
        <h1>Good to have you here{firstName ? `, ${firstName}` : ""}.</h1>
        <p>Create events, share one upload link per activity, and publish the best photos and videos.</p>
      </section>
      <Dashboard supabase={supabase} />
      <footer className="workspace-footer"><span>ACTIVE ZONE OUTDOOR</span><span>MADE FOR THE OUTDOORS <b>↗</b></span></footer>
    </main>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2C14.4 15.4 18.8 11.9 24 11.9Z"/></svg>;
}
