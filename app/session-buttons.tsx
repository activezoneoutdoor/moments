"use client";

import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return <button className="google-button" onClick={() => signIn("google", { callbackUrl: "/" })}>
    <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"/><path fill="#1976D2" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2C14.4 15.4 18.8 11.9 24 11.9Z"/></svg>
    Continue with Google <span aria-hidden="true">→</span>
  </button>;
}

export function SignOutButton() {
  return <button className="sign-out" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>;
}
