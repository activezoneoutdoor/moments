import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { SignInButton, SignOutButton } from "./session-buttons";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">AZ</div>
          <p className="eyebrow">ACTIVE ZONE OUTDOOR</p>
          <h1>Your work,<br />beautifully in focus.</h1>
          <p className="intro">A private studio for the moments, places, and people behind Active Zone Outdoor.</p>
          <SignInButton />
          <p className="access-note"><span className="lock-icon">●</span> Sign in with your Active Zone Google Workspace account</p>
          <p className="domain-note">Access is limited to <strong>@activezoneoutdoor.cy</strong></p>
        </section>
        <aside className="visual-panel" aria-label="Studio introduction">
          <div className="sun"></div>
          <div className="mountain mountain-back"></div>
          <div className="mountain mountain-front"></div>
          <div className="photo-caption"><span>01 / YOUR STUDIO</span><b>Made for the outdoors.</b></div>
          <div className="image-credit">ACTIVE ZONE · CYPRUS</div>
        </aside>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Active Zone Studio home"><span className="brand-mark small">AZ</span><span>ACTIVE ZONE <i>STUDIO</i></span></a>
        <div className="account"><span className="avatar">{session.user.name?.[0] ?? "A"}</span><span className="account-email">{session.user.email}</span><SignOutButton /></div>
      </header>
      <section className="welcome">
        <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
        <h1>Good to have you here{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}.</h1>
        <p>Everything you create for Active Zone, in one place.</p>
      </section>
      <section className="album-section">
        <div className="section-heading"><div><p className="eyebrow">START HERE</p><h2>Your studio</h2></div><span className="coming-label">01 COLLECTION</span></div>
        <article className="album-card">
          <div className="album-art"><div className="album-sun"></div><div className="album-ridge"></div><span>FIELD NOTES · CYPRUS</span></div>
          <div className="album-info"><div><p className="eyebrow">PHOTO LIBRARY</p><h3>Photo albums</h3><p>Your visual library for trips, products, and outdoor stories.</p></div><span className="soon">COMING SOON</span></div>
        </article>
      </section>
      <footer className="workspace-footer"><span>ACTIVE ZONE OUTDOOR</span><span>MADE FOR THE OUTDOORS <b>↗</b></span></footer>
    </main>
  );
}
