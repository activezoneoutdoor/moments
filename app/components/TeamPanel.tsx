"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roleLabels, workspaceDomain, type TeamRole } from "@/lib/auth";

type Member = { email: string; role: TeamRole; granted_by: string | null; granted_at: string };

const roleHelp: Record<TeamRole, string> = {
  admin: "Everything, including this team list",
  staff: "Events, albums and bookings",
  leader: "Only the events where they're the leader: bookings, payments and album review",
};

/**
 * Admins only: who has access and with which role. The database enforces all of it (staff_roles policies):
 * admin and staff need a Workspace email, and the last admin can't be removed.
 */
export function TeamPanel({ supabase, myEmail }: { supabase: SupabaseClient; myEmail: string }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("leader");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("staff_roles").select("email, role, granted_by, granted_at").order("role").order("email");
    if (error) setMessage({ text: error.message, warn: true });
    else setTeam(data as Member[]);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function act(task: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await task();
      if (error) throw new Error(friendly(error.message));
      setMessage({ text: done, warn: false });
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), warn: true });
    } finally {
      setBusy(false);
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (role !== "leader" && !address.endsWith(`@${workspaceDomain}`)) {
      setMessage({ text: `Admins and staff need an @${workspaceDomain} email. Leaders can use any email.`, warn: true });
      return;
    }
    void act(
      () => supabase.from("staff_roles").upsert({ email: address, role }),
      `${address} is now ${roleLabels[role].toLowerCase()}. They get access the next time the page loads.`,
    ).then(() => setEmail(""));
  };

  const change = (member: Member, next: TeamRole) =>
    act(() => supabase.from("staff_roles").update({ role: next }).eq("email", member.email), `${member.email} is now ${roleLabels[next].toLowerCase()}.`);

  const remove = (member: Member) => {
    const self = member.email === myEmail.toLowerCase();
    if (!window.confirm(self ? "Remove your own access? You'll be signed out of the admin." : `Remove ${member.email}'s access? It stops immediately.`)) return;
    void act(() => supabase.from("staff_roles").delete().eq("email", member.email), `${member.email} no longer has access.`);
  };

  return (
    <section className="album-section team-panel">
      <div className="section-heading">
        <div><p className="eyebrow">ADMIN</p><h2>Team &amp; access</h2></div>
      </div>
      <p className="form-hint">
        Only people listed here can open the admin. Remove someone when they leave and their access stops on their next click,
        even if their account still exists. Staff sign in with Google; leaders sign in with a code sent to their email.
      </p>

      <form className="team-add" onSubmit={add}>
        <label>Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${workspaceDomain}`} disabled={busy} />
        </label>
        <label>Role
          <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} disabled={busy}>
            {(Object.keys(roleLabels) as TeamRole[]).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={busy}>Give access</button>
        <small className="form-hint team-role-help">{roleLabels[role]}: {roleHelp[role]}</small>
      </form>

      {message && <p className={message.warn ? "panel-message warn" : "panel-message"} role="status">{message.text}</p>}

      <div className="booking-list team-list">
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>Given by</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.email}>
                <td>{m.email}{m.email === myEmail.toLowerCase() && <span className="pill">you</span>}</td>
                <td>
                  <select aria-label={`Role of ${m.email}`} value={m.role} disabled={busy} onChange={(e) => void change(m, e.target.value as TeamRole)}>
                    {(Object.keys(roleLabels) as TeamRole[])
                      .filter((r) => r === "leader" || m.email.endsWith(`@${workspaceDomain}`))
                      .map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                  </select>
                </td>
                <td className="muted-cell">{m.granted_by ?? "—"} · {new Date(m.granted_at).toLocaleDateString("en-GB")}</td>
                <td className="booking-actions"><button disabled={busy} onClick={() => remove(m)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function friendly(message: string): string {
  if (message.includes("at least one admin")) return "There must always be at least one admin. Make someone else admin first.";
  if (message.includes("staff_roles_check")) return `Admins and staff need an @${workspaceDomain} email.`;
  return message;
}
