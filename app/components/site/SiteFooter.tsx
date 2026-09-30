export function SiteFooter({ home = false }: { home?: boolean }) {
  const base = home ? "" : "/";
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <a className="footer-logo" href={home ? "#top" : "/"} aria-label="Active Zone Outdoor home">
            <picture>
              <source srcSet="/assets/img/logo-official-160.webp" type="image/webp" />
              <img src="/assets/img/logo-official-160.png" alt="Active Zone Outdoor logo" width="96" height="96" loading="lazy" />
            </picture>
          </a>
          <p className="slogan">“Learning not confined within four walls”</p>
          <p>Non-profit youth organisation promoting mental health, inclusion and active citizenship through outdoor sport. Larnaca, Cyprus — since 2019.</p>
        </div>
        <nav aria-label="Footer">
          <h3>Explore</h3>
          <ul>
            <li><a href={`${base}#about`}>About</a></li>
            <li><a href={`${base}#activities`}>Activities</a></li>
            <li><a href={`${base}#inclusion`}>Inclusion</a></li>
            <li><a href={`${base}#erasmus`}>Erasmus+</a></li>
            <li><a href="/events/">Events &amp; albums</a></li>
            <li><a href="/account/">Members area</a></li>
            <li><a href="/admin/">Admin</a></li>
          </ul>
        </nav>
        <div>
          <h3>Contact</h3>
          <ul>
            <li><a href="tel:+35799541017">+357 99 541 017</a></li>
            <li>Riga Fereou 10, Klavdia</li>
            <li>Larnaca, Cyprus</li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>&copy; <span id="year">2026</span> Active Zone Outdoor. All rights reserved.</p>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
