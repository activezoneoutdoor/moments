"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamRole } from "@/lib/auth";
import type { Member } from "@/lib/members";
import { AlbumsPanel } from "@/app/components/AlbumsPanel";
import { Dashboard } from "@/app/components/Dashboard";
import { MembersPanel } from "@/app/components/MembersPanel";
import { TeamPanel } from "@/app/components/TeamPanel";
import { ProfilePanel } from "./ProfilePanel";
import "./admin.css";

export type Section = "profile" | "events" | "albums" | "members" | "users";

const sectionLabels: Record<Section, string> = { profile: "Profile", events: "Events", albums: "Albums", members: "Members", users: "Users" };

/** Which sections each person sees (the database enforces the same limits). Members see only their profile. */
export function sectionsFor(role: TeamRole | null, hasMember: boolean): Section[] {
  const profile: Section[] = hasMember ? ["profile"] : [];
  if (role === "admin") return [...profile, "events", "albums", "members", "users"];
  if (role === "staff") return [...profile, "events", "albums", "members"];
  if (role === "leader") return [...profile, "events", "albums"];
  return profile;
}

/**
 * My account's sub-menu and the open section. The section is kept in the address (#events, #albums, …) so it
 * survives a reload. With only one section (a member's profile) there is no sub-menu.
 */
export function AccountSections({ supabase, role, member, email, onMemberSaved }: {
  supabase: SupabaseClient;
  role: TeamRole | null;
  member: Member | null;
  email: string;
  onMemberSaved: (member: Member) => void;
}) {
  const sections = sectionsFor(role, Boolean(member));
  // The team starts on Events (their daily work); members on their profile.
  const start: Section = role ? "events" : sections[0] ?? "profile";
  const [section, setSection] = useState<Section>(start);
  const [openEventId, setOpenEventId] = useState<string | undefined>();
  const canManage = role === "admin" || role === "staff";

  useEffect(() => {
    const fromHash = () => {
      const wanted = window.location.hash.slice(1) as Section;
      setSection(sections.includes(wanted) ? wanted : start);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // sections only changes with the account, which remounts this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (next: Section) => {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  if (sections.length === 0) return null;

  return (
    <>
      {sections.length > 1 && (
        <nav className="account-tabs" aria-label="My account">
          {sections.map((s) => (
            <button key={s} type="button" className={s === section ? "is-active" : undefined} aria-current={s === section ? "page" : undefined} onClick={() => open(s)}>
              {sectionLabels[s]}
            </button>
          ))}
        </nav>
      )}
      {section === "profile" && member && <ProfilePanel supabase={supabase} member={member} email={email} onSaved={onMemberSaved} />}
      {section !== "profile" && (
        <div className="azo-admin">
          {section === "events" && <Dashboard key={openEventId ?? "events"} supabase={supabase} canManage={canManage} openEventId={openEventId} />}
          {section === "albums" && <AlbumsPanel supabase={supabase} onReview={(id) => { setOpenEventId(id); open("events"); }} />}
          {section === "members" && canManage && <MembersPanel supabase={supabase} />}
          {section === "users" && role === "admin" && <TeamPanel supabase={supabase} myEmail={email} />}
        </div>
      )}
    </>
  );
}
