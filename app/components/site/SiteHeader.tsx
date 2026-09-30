import { AdminLink } from "./AdminLink";

/**
 * The website's header. On the home page section links are "#about"; elsewhere they point back to "/#about".
 * Pages without the hero image use `solid` so the header is readable from the start.
 */
export function SiteHeader({ home = false, solid = false, current }: { home?: boolean; solid?: boolean; current?: "members" | "events" }) {
  const base = home ? "" : "/";
  return (
    <header className={solid ? "site-header is-solid" : "site-header"} id="top">
      <div className="container nav-wrap">
        <a className="brand" href={home ? "#top" : "/"} aria-label="Active Zone Outdoor home">
          <picture>
            <source srcSet="/assets/img/logo-official-160.webp" type="image/webp" />
            <img className="brand-logo" src="/assets/img/logo-official-160.png" alt="" width="48" height="48" />
          </picture>
          <span>Active Zone <strong>Outdoor</strong></span>
        </a>

        <button className="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>

        <nav id="site-nav" className="site-nav" aria-label="Main">
          <ul>
            <li><a href={`${base}#about`}>About</a></li>
            <li><a href={`${base}#activities`}>Activities</a></li>
            <li><a href={`${base}#inclusion`}>Inclusion</a></li>
            <li><a href={`${base}#erasmus`}>Erasmus+</a></li>
            <li><a href={`${base}#involved`}>Get involved</a></li>
            <li>
              <a href="/events/" className={current === "events" ? "is-current" : undefined} aria-current={current === "events" ? "page" : undefined}>
                Events
              </a>
            </li>
            <li>
              <a href="/account/" className={current === "members" ? "is-current" : undefined} aria-current={current === "members" ? "page" : undefined}>
                Members
              </a>
            </li>
            <AdminLink />
            <li><a className="btn btn-sm btn-accent" href={`${base}#contact`}>Contact us</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
