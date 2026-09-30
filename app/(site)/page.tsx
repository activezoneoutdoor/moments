import { SiteBehaviour } from "@/app/components/site/SiteBehaviour";
import { SiteFooter } from "@/app/components/site/SiteFooter";
import { SiteHeader } from "@/app/components/site/SiteHeader";

// The public website (ported from activezoneoutdoor/web). Interactions live in SiteBehaviour.
export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <SiteHeader home />

        <main id="main">

          <section className="hero">
            <div className="hero-bg" aria-hidden="true">
              <svg className="hero-scene" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMax slice">
                <defs>
                  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0b2e23"/>
                    <stop offset=".55" stopColor="#1d5a45"/>
                    <stop offset="1" stopColor="#f4a261"/>
                  </linearGradient>
                  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2a9d8f"/>
                    <stop offset="1" stopColor="#15594f"/>
                  </linearGradient>
                </defs>
                <rect width="1440" height="800" fill="url(#sky)"/>
                <circle cx="1100" cy="470" r="90" fill="#ffd59e" opacity=".9"/>
                <path d="M0 520 L180 380 L300 460 L470 300 L640 470 L760 400 L900 500 L1080 360 L1250 470 L1440 380 L1440 800 L0 800Z" fill="#164a39" opacity=".85"/>
                <path d="M0 590 L220 470 L380 560 L560 450 L760 580 L960 490 L1160 590 L1320 520 L1440 560 L1440 800 L0 800Z" fill="#0f3d2e"/>
                <path d="M0 650 C240 630 480 670 720 650 C960 630 1200 670 1440 650 L1440 800 L0 800Z" fill="url(#sea)"/>
                <path className="wave" d="M0 690 C200 675 400 705 600 690 C800 675 1000 705 1200 690 C1320 682 1400 690 1440 695" stroke="#bfe9e2" strokeWidth="2" fill="none" opacity=".45"/>
                <path className="wave wave-2" d="M0 730 C200 715 400 745 600 730 C800 715 1000 745 1200 730 C1320 722 1400 730 1440 735" stroke="#bfe9e2" strokeWidth="2" fill="none" opacity=".3"/>
              </svg>
            </div>

            <div className="container hero-content">
              <p className="eyebrow">Non-profit youth organisation · Larnaca, Cyprus</p>
              <h1>Learning <span className="hl">not confined</span> within four walls.</h1>
              <p className="lead">We connect young people with better mental health through sport and the outdoors — climbing, paddling, sailing and more — and open those opportunities to everyone, including youth with disabilities and fewer opportunities.</p>
              <div className="hero-cta">
                <a className="btn btn-accent" href="#activities">Explore activities</a>
                <a className="btn btn-ghost" href="#involved">Volunteer with us</a>
              </div>
              <ul className="hero-stats" aria-label="At a glance">
                <li><strong>2019</strong><span>Founded in Larnaca</span></li>
                <li><strong>9+</strong><span>Outdoor sports</span></li>
                <li><strong>Erasmus+</strong><span>Accredited organisation</span></li>
              </ul>
            </div>
          </section>


          <section className="section" id="about">
            <div className="container split">
              <div className="reveal">
                <p className="eyebrow">Who we are</p>
                <h2>Youth workers who believe nature changes lives</h2>
                <p>Active Zone Outdoor is a non-profit, non-governmental organisation founded in Larnaca in 2019 by a group of young people and youth workers active in outdoor sports and non-formal education.</p>
                <p>Our mission is simple: <strong>connect young people with opportunities to build better mental health through sport and outdoor activities</strong> — and help them become active, engaged members of society who reach their full potential.</p>
              </div>
              <ul className="goals reveal" aria-label="Our goals">
                <li>
                  <span className="goal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.4-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6C19 16.6 12 21 12 21z"/></svg>
                  </span>
                  <div><h3>Healthy lifestyles</h3><p>Promoting wellbeing through non-formal learning, nature and sport.</p></div>
                </li>
                <li>
                  <span className="goal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 20c.2-2.6 1.6-4.6 3.5-4.6 2 0 3 1.8 3 4.6"/></svg>
                  </span>
                  <div><h3>Active citizenship</h3><p>Engaging young people locally and across Europe, and championing volunteering.</p></div>
                </li>
                <li>
                  <span className="goal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>
                  </span>
                  <div><h3>European values</h3><p>Building understanding through intercultural education and exchanges.</p></div>
                </li>
                <li>
                  <span className="goal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/></svg>
                  </span>
                  <div><h3>Protecting nature</h3><p>Caring for Cyprus' landscapes, including the Natura 2000 ecological network.</p></div>
                </li>
              </ul>
            </div>
          </section>


          <section className="section section-tint" id="activities">
            <div className="container">
              <div className="section-head reveal">
                <p className="eyebrow">What we do</p>
                <h2>Land, sea &amp; everything in between</h2>
                <p>We plan and coordinate a wide range of outdoor sports, led by experienced youth workers and volunteers.</p>
              </div>

              <div className="filter" role="group" aria-label="Filter activities">
                <button className="chip is-active" data-filter="all" aria-pressed="true">All</button>
                <button className="chip" data-filter="land" aria-pressed="false">On land</button>
                <button className="chip" data-filter="water" aria-pressed="false">On water</button>
                <button className="chip" data-filter="explore" aria-pressed="false">Explore</button>
              </div>

              <ul className="cards" id="activity-grid">
                <li className="card reveal" data-cat="land">
                  <span className="card-icon c1" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 20 10 6l4 7 2-3 5 10z"/><circle cx="16" cy="5" r="1.6"/></svg></span>
                  <h3>Rock climbing</h3><p>Build trust, focus and confidence on real rock and walls — adapted for every ability.</p>
                </li>
                <li className="card reveal" data-cat="land">
                  <span className="card-icon c2" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg></span>
                  <h3>Archery</h3><p>A calm, precise sport that trains patience and concentration.</p>
                </li>
                <li className="card reveal" data-cat="water">
                  <span className="card-icon c3" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v14M12 3l7 12h-7M12 5 6 15h6M3 19c3 2 6 2 9 0s6-2 9 0"/></svg></span>
                  <h3>Sailing</h3><p>Learn to read the wind along the Larnaca coast.</p>
                </li>
                <li className="card reveal" data-cat="water">
                  <span className="card-icon c4" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 15c3 1.5 13 1.5 16 0l-2 3H6zM5 4l14 14M4 5l2-2M18 19l2-2"/></svg></span>
                  <h3>Kayaking</h3><p>Paddle crystal-clear Mediterranean water, solo or in tandem.</p>
                </li>
                <li className="card reveal" data-cat="water">
                  <span className="card-icon c5" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 18h18M5 18c0-1 1-2 7-2s7 1 7 2M12 16V5M12 5l3 1M8 11l4-2"/><circle cx="12" cy="3.5" r="1.3"/></svg></span>
                  <h3>Stand-up paddle</h3><p>Balance, core strength and sunset sessions on the sea.</p>
                </li>
                <li className="card reveal" data-cat="water">
                  <span className="card-icon c6" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M11 3c4 3 6 8 5 13H8c1-4 2-9 3-13zM11 3v13M3 19c3 2 6 2 9 0s6-2 9 0"/></svg></span>
                  <h3>Windsurfing</h3><p>Harness Cyprus' steady breezes for a full-body challenge.</p>
                </li>
                <li className="card reveal" data-cat="land">
                  <span className="card-icon c7" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9 8 6h3M15 9l-3 7"/></svg></span>
                  <h3>Cycling</h3><p>Explore villages, trails and coastline on two wheels.</p>
                </li>
                <li className="card reveal" data-cat="explore">
                  <span className="card-icon c8" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg></span>
                  <h3>Orienteering</h3><p>Map, compass and teamwork — navigation as a game.</p>
                </li>
                <li className="card reveal" data-cat="explore">
                  <span className="card-icon c9" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg></span>
                  <h3>Geocaching</h3><p>A real-world treasure hunt that uncovers hidden corners of Cyprus.</p>
                </li>
                <li className="card reveal" data-cat="explore">
                  <span className="card-icon c1" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 20 9 9l3 5 3-3 6 9zM8 5h.01M13 4h.01"/></svg></span>
                  <h3>Hiking</h3><p>Guided walks through mountains, salt lakes and Natura 2000 sites.</p>
                </li>
              </ul>
            </div>
          </section>


          <section className="section" id="inclusion">
            <div className="container split split-rev">
              <div className="inclusion-panel reveal" aria-hidden="true">
                <div className="bubble b1">Climbing for all abilities</div>
                <div className="bubble b2">Blind football</div>
                <div className="bubble b3">Adaptive shooting</div>
                <div className="bubble b4">Orienteering for learning difficulties</div>
              </div>
              <div className="reveal">
                <p className="eyebrow">Inclusion first</p>
                <h2>Outdoor adventure is for everyone</h2>
                <p>Young people with fewer opportunities — especially youth with disabilities or facing financial difficulties — are at the heart of our work. We customise every activity so that nobody is left on the sidelines.</p>
                <ul className="ticks">
                  <li><strong>Rock climbing</strong> adapted for different physical and sensory needs</li>
                  <li><strong>Football for people with visual impairments</strong></li>
                  <li><strong>Shooting sports</strong> for people with mobility impairments</li>
                  <li><strong>Orienteering</strong> designed for youth with learning difficulties</li>
                </ul>
                <a className="btn btn-primary" href="#contact">Ask about accessible sessions</a>
              </div>
            </div>
          </section>


          <section className="section section-dark" id="erasmus">
            <div className="container">
              <div className="section-head reveal">
                <p className="eyebrow">Europe-wide</p>
                <h2>Erasmus+ &amp; European Solidarity Corps</h2>
                <p>As an accredited Erasmus+ organisation, we host and send young people and youth workers across Europe for learning that happens outdoors.</p>
              </div>
              <div className="programs">
                <article className="program reveal">
                  <span className="tag">Youth exchanges</span>
                  <h3>Learn by doing, together</h3>
                  <p>Short-term international exchanges where groups of young people from different countries meet in nature, share cultures and build skills through sport.</p>
                </article>
                <article className="program reveal">
                  <span className="tag">Volunteering</span>
                  <h3>Volunteer in Larnaca</h3>
                  <p>Join our team as a European Solidarity Corps volunteer. Help lead climbing, paddling, hiking and inclusive activities for young people and people with disabilities.</p>
                  <a className="link-arrow" href="https://youth.europa.eu/solidarity_en" target="_blank" rel="noopener">See opportunities on the European Youth Portal</a>
                </article>
                <article className="program reveal">
                  <span className="tag">Training</span>
                  <h3>For youth workers</h3>
                  <p>Mobility and training courses on outdoor education, inclusion and non-formal learning methods for professionals working with young people.</p>
                </article>
              </div>
              <p className="eu-note reveal">
                <span className="eu-flag" aria-hidden="true"></span>
                Activities are co-funded by the European Union. Views expressed are those of the organisers only.
              </p>
            </div>
          </section>


          <section className="section" id="involved">
            <div className="container">
              <div className="section-head reveal">
                <p className="eyebrow">Join the movement</p>
                <h2>Get involved</h2>
              </div>
              <div className="involve">
                <a className="involve-card reveal" href="#contact" data-topic="Joining an activity">
                  <h3>Take part</h3>
                  <p>Aged 13–30 and curious? Join a local session or an international exchange.</p>
                  <span className="link-arrow">Sign up</span>
                </a>
                <a className="involve-card reveal" href="#contact" data-topic="Volunteering">
                  <h3>Volunteer</h3>
                  <p>Share your skills as a local or European volunteer and help run activities.</p>
                  <span className="link-arrow">Apply</span>
                </a>
                <a className="involve-card reveal" href="#contact" data-topic="Partnership">
                  <h3>Partner with us</h3>
                  <p>Schools, NGOs and organisations across Europe — let's build projects together.</p>
                  <span className="link-arrow">Start a conversation</span>
                </a>
                <a className="involve-card reveal" href="https://causes.benevity.org/causes/196-5657120011010_9980" target="_blank" rel="noopener">
                  <h3>Donate</h3>
                  <p>Help us keep activities free or low-cost for young people who need them most.</p>
                  <span className="link-arrow">Give via Benevity</span>
                </a>
              </div>
            </div>
          </section>


          <section className="section section-tint" id="contact">
            <div className="container split">
              <div className="reveal">
                <p className="eyebrow">Say hello</p>
                <h2>Let's plan your next adventure</h2>
                <p>Questions about activities, volunteering or partnerships? Send us a message or give us a call.</p>
                <ul className="contact-list">
                  <li>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>
                    <a href="tel:+35799541017">+357 99 541 017</a>
                  </li>
                  <li>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>
                    <a href="https://www.google.com/maps/search/?api=1&amp;query=Riga+Fereou+10+Klavdia+Cyprus" target="_blank" rel="noopener">Riga Fereou 10, Klavdia, Larnaca, Cyprus</a>
                  </li>
                </ul>
              </div>

              <form className="contact-form reveal" id="contact-form" noValidate>
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input id="name" name="name" autoComplete="name" required />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="field">
                  <label htmlFor="topic">I'm interested in</label>
                  <select id="topic" name="topic">
                    <option>Joining an activity</option>
                    <option>Volunteering</option>
                    <option>Erasmus+ youth exchange</option>
                    <option>Partnership</option>
                    <option>Something else</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea id="message" name="message" rows={4} required></textarea>
                </div>
                <div className="hp" aria-hidden="true">
                  <label htmlFor="website">Leave this field empty</label>
                  <input id="website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                <button className="btn btn-primary btn-block" type="submit">Send message</button>
                <p className="form-status" role="status" aria-live="polite"></p>
              </form>
            </div>
          </section>
        </main>


      <SiteFooter home />

      <SiteBehaviour />
    </>
  );
}
