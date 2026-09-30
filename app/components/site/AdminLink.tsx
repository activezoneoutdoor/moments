"use client";

import { useTeamRole } from "@/lib/auth";

/** "Admin" in the site menu, only for signed-in team members (admin, staff, leader). Others use the footer link. */
export function AdminLink() {
  const role = useTeamRole();
  if (!role) return null;
  return <li><a href="/admin/">Admin</a></li>;
}
