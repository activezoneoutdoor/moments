"use client";

import type { Session } from "@supabase/supabase-js";
import { roleLabels, type TeamRole } from "@/lib/auth";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The website's home page (app/(site)). */
export const siteHomeUrl = `${basePath}/`;
/** Events & albums list. */
export const publicHomeUrl = `${basePath}/events/`;
export const adminUrl = `${basePath}/admin/`;

export function Wordmark({ label = "AZO MOMENTS", href = publicHomeUrl }: { label?: string; href?: string }) {
  return <a className="wordmark" href={href} aria-label="AZO Moments home"><span className="brand-mark small">AZO</span><span>ACTIVE ZONE OUTDOOR <i>{label}</i></span></a>;
}

export function StaffTopbar({ session, role, onSignOut }: { session: Session; role: TeamRole; onSignOut: () => void }) {
  const fullName = session.user.user_metadata.full_name
    ?? session.user.user_metadata.name
    ?? "AZO team member";
  const avatarUrl = session.user.user_metadata.avatar_url ?? session.user.user_metadata.picture;

  return (
    <header className="topbar">
      <Wordmark label="ADMIN" href={adminUrl} />
      <div className="account">
        <a className="topbar-link" href={siteHomeUrl}>Website ↗</a>
        <a className="topbar-link" href={publicHomeUrl}>Events ↗</a>
        {avatarUrl ? <img className="avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{fullName[0]?.toUpperCase() ?? "A"}</span>}
        <span className="pill role-pill">{roleLabels[role]}</span>
        <span className="account-details"><span className="account-name" title={fullName}>{fullName}</span><span className="account-email" title={session.user.email ?? undefined}>{session.user.email}</span></span>
        <button className="sign-out" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}
