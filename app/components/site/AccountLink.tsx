"use client";

import { useSignedIn } from "@/lib/auth";

/** "My account" in the site menu when signed in (members and the team alike), "Sign in" otherwise. */
export function AccountLink({ current }: { current: boolean }) {
  const signedIn = useSignedIn();
  return (
    <a href="/account/" className={current ? "is-current" : undefined} aria-current={current ? "page" : undefined}>
      {signedIn ? "My account" : "Sign in"}
    </a>
  );
}
