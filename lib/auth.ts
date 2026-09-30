"use client";

import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

/**
 * Supabase session for Active Zone Outdoor team members (admins, staff and leaders). Staff sign in with Google
 * Workspace; leaders, who may not have a Workspace account, with a code sent to their email. Accounts without a
 * team role are signed out of this page.
 */
export function useTeamSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<TeamRole | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let current = "";

    const acceptSession = async (next: Session | null) => {
      const key = next?.user.id ?? "";
      if (key === current && key !== "") return;
      current = key;
      if (!next) {
        setSession(null);
        setRole(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      try {
        const nextRole = await fetchTeamRole(supabase);
        if (nextRole) {
          setSession(next);
          setRole(nextRole);
          setNotice("");
        } else {
          setSession(null);
          setRole(null);
          setNotice(`${next.user.email ?? "This account"} isn't on the Active Zone Outdoor team. Ask an admin to add you.`);
          current = "";
          await supabase.auth.signOut({ scope: "local" });
        }
      } catch {
        setNotice("Could not check your access. Please try again.");
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
   * Signs out of this browser. supabase-js keeps the session when its logout request fails,
   * so on an error or a slow response the stored session is cleared directly.
   */
  async function signOut() {
    const timeout = new Promise<{ error: Error }>((resolve) => window.setTimeout(() => resolve({ error: new Error("Sign-out timed out") }), 4000));
    const result = supabase
      ? await Promise.race([supabase.auth.signOut({ scope: "local" }), timeout]).catch((error: Error) => ({ error }))
      : { error: null };
    if (result.error) clearStoredSession();
    setSession(null);
    setRole(null);
    window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
  }

  return { supabase, session, role, checking, notice, signInWithGoogle, sendCode, verifyCode, signOut };
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

/** The team role of the session stored in this browser, if any (no sign-in prompt). */
export function useTeamRole(): TeamRole | null {
  const [role, setRole] = useState<TeamRole | null>(null);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setRole(await fetchTeamRole(supabase).catch(() => null));
    });
  }, []);
  return role;
}
