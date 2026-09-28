"use client";

import { useEffect } from "react";
import { PublicShell, publicHomeUrl } from "../components/Shell";

/** The events list moved to the home page; keep old /events/ links working. */
export default function EventsRedirect() {
  useEffect(() => { window.location.replace(publicHomeUrl); }, []);
  return <PublicShell><p className="empty-state">Events are now on the <a href={publicHomeUrl}>home page</a>.</p></PublicShell>;
}
