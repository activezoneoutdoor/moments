import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function Wordmark({ label = "AZO STUDIO" }: { label?: string }) {
  return <a className="wordmark" href={`${basePath}/`} aria-label="AZO Studio home"><span className="brand-mark small">AZO</span><span>ACTIVE ZONE OUTDOOR <i>{label}</i></span></a>;
}

export function StaffTopbar({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const fullName = session.user.user_metadata.full_name
    ?? session.user.user_metadata.name
    ?? "AZO team member";
  const avatarUrl = session.user.user_metadata.avatar_url ?? session.user.user_metadata.picture;

  return (
    <header className="topbar">
      <Wordmark />
      <div className="account">
        <a className="topbar-link" href={`${basePath}/events/`}>Public events ↗</a>
        {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{fullName[0]?.toUpperCase() ?? "A"}</span>}
        <span className="account-details"><span className="account-name" title={fullName}>{fullName}</span><span className="account-email" title={session.user.email ?? undefined}>{session.user.email}</span></span>
        <button className="sign-out" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="workspace-shell">
      <header className="topbar">
        <Wordmark label="EVENTS & ALBUMS" />
        <nav className="account"><a className="topbar-link" href={`${basePath}/events/`}>All events</a></nav>
      </header>
      {children}
      <footer className="workspace-footer"><span>ACTIVE ZONE OUTDOOR</span><span>MADE FOR THE OUTDOORS <b>↗</b></span></footer>
    </main>
  );
}
