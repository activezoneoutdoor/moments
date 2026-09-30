import type { ReactNode } from "react";
import { SiteBehaviour } from "@/app/components/site/SiteBehaviour";
import { SiteFooter } from "@/app/components/site/SiteFooter";
import { SiteHeader } from "@/app/components/site/SiteHeader";
import "./public-events.css";

/** Public event pages (/events/, /event/, /booking/, /upload/) inside the website's header and footer. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader solid current="events" />
      <main id="main" className="azo-public">
        <div className="container">{children}</div>
      </main>
      <SiteFooter />
      <SiteBehaviour />
    </>
  );
}
