"use client";

import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { claimMembership, startAccountLink, type Member } from "@/lib/members";

export const workspaceDomain = "activezoneoutdoor.cy";

/** Team roles from the staff_roles table (see supabase/migrations/20261008000000_roles.sql). */
export type TeamRole = "admin" | "staff" | "leader";

export const roleLabels: Record<TeamRole, string> = { admin: "Admin", staff: "Staff", leader: "Leader" };

/** The signed-in user's team role, or null. The database decides, so a removed team member gets null. */
export async function fetchTeamRole(supabase: SupabaseClient): Promise<TeamRole | null> {
  const { data, error } = await supabase.rpc("my_role");
  if (error) throw error;
  return (data as TeamRole | null) ?? null;
}

/** A started request to link another email to a member, kept in this browser until the other sign-in. */
export type PendingLink = { token: string; name: string; expires: number };

const LINK_KEY = "azo-link-request";

function readPendingLink(): PendingLink | null {
  try {
    const link = JSON.parse(localStorage.getItem(LINK_KEY) ?? "null") as PendingLink | null;
    return link?.token && link.expires > Date.now() ? link : null;
  } catch {
    return null;
  }
}

function writePendingLink(link: PendingLink | null) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    // Storage unavailable: linking can't survive the sign-in, and the profile says so.
    if (link) throw new Error("This browser can't keep the request while you sign in. Allow site data and try again.");
  }
}

/**
 * The session for My account (/account/). Everyone signs in here: members with a code sent to their email, the
 * team (admins, staff, leaders) with the same code or, with an Active Zone Outdoor Workspace account, Google.
 * `role` comes from the database (a removed team member gets null and sees only their member profile).
 * `member` is the signed-in person's member record (everyone has one, the team included), created on first sign-in.
 */
export function useAccountSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<TeamRole | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [linkResult, setLinkResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [supabase] = useState(() => getSupabaseBrowserClient());

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let current: string | undefined;
    setPendingLink(readPendingLink());

    const acceptSession = async (next: Session | null) => {
      const key = next?.user.id ?? "";
      if (key === current) return;
      current = key;
      if (!next) {
        setSession(null);
        setRole(null);
        setMember(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      try {
        const nextRole = await fetchTeamRole(supabase);
        // Signing in after "Link another email": link this sign-in, then open the account either way.
        const link = readPendingLink();
        let nextMember: Member | null = null;
        if (link) {
          writePendingLink(null);
          setPendingLink(null);
          try {
            nextMember = await claimMembership(supabase, link.token);
            setLinkResult({ text: `${next.user.email ?? "This email"} is now linked to your membership. You can sign in with either email.`, ok: true });
          } catch (err) {
            setLinkResult({ text: err instanceof Error ? err.message : String(err), ok: false });
          }
        }
        nextMember ??= await claimMembership(supabase);
        setSession(next);
        setRole(nextRole);
        setMember(nextMember);
        setNotice("");
      } catch {
        current = undefined;
        setSession(null);
        setNotice("Could not open your account. Please try again.");
      } finally {
        setChecking(false);
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setNotice("Could not check your sign-in. Please try again.");
      void acceptSession(data.session);
    });

    // Supabase calls must not run inside the auth callback itself, so the check is deferred.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      window.setTimeout(() => { void acceptSession(next); }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function signInWithGoogle() {
    if (!supabase) return;
    setNotice("");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { hd: workspaceDomain, prompt: "select_account" } },
    });
    if (error) setNotice(error.message);
  }

  /** Emails a one-time sign-in code. Returns false (with a notice) if it couldn't be sent. */
  async function sendCode(email: string): Promise<boolean> {
    if (!supabase) return false;
    setNotice("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    if (error) {
      setNotice(error.message);
      return false;
    }
    return true;
  }

  async function verifyCode(email: string, code: string): Promise<void> {
    if (!supabase) return;
    setNotice("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    if (error) setNotice(error.message === "Token has expired or is invalid" ? "That code is wrong or has expired. Request a new one." : error.message);
  }

  /**
   * Starts linking another email: remembers the request in this browser and signs out, so the member signs in with
   * the other email (or Google account). The next sign-in completes the link.
   */
  async function startLinking() {
    if (!supabase || !member) return;
    const token = await startAccountLink(supabase);
    const link = { token, name: member.full_name, expires: Date.now() + 29 * 60 * 1000 };
    writePendingLink(link);
    setPendingLink(link);
    setLinkResult(null);
    // The sign-out event shows the sign-in form; if signing out fails, clear the session and start afresh.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      clearStoredSession();
      window.location.reload();
    }
  }

  function cancelLinking() {
    writePendingLink(null);
    setPendingLink(null);
  }

  /**
   * Signs out of this browser. supabase-js keeps the session when its logout request fails,
   * so on an error or a slow response the stored session is cleared directly.
   */
  async function signOut() {
    const timeout = new Promise<{ error: Error }>((resolve) => window.setTimeout(() => resolve({ error: new Error("Sign-out timed out") }), 4000));
    const result = supabase
      ? await Promise.race([supabase.auth.signOut({ scope: "local" }), timeout]).catch((error: Error) => ({ error }))
      : { error: null };
    if (result.error) clearStoredSession();
    window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
  }

  return {
    supabase, session, role, member, setMember, checking, notice, signInWithGoogle, sendCode, verifyCode, signOut,
    pendingLink, linkResult, clearLinkResult: () => setLinkResult(null), startLinking, cancelLinking,
  };
}

function clearStoredSession() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.+-auth-token/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: there is no stored session to clear.
  }
}

/** Whether someone is signed in in this browser (no sign-in prompt). For the menu label. */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);
  return signedIn;
}
