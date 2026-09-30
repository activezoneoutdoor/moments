"use client";

import { useEffect } from "react";

// Contact messages go to the `contact` Supabase Edge Function, which stores them and emails the team. Without a
// Supabase URL (or if the function can't be reached) the form opens the visitor's email app instead.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CONTACT_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/contact` : "";
// TODO: confirm this is the organisation's real inbox before going live.
const CONTACT_EMAIL = "info@activezoneoutdoor.cy";
const PHONE = "+357 99 541 017";

/**
 * The website's interactions (ported from activezoneoutdoor/web main.js): sticky header, mobile menu,
 * section highlighting, reveal-on-scroll, the activity filter and the contact form. It works on the static
 * markup of app/(site)/page.tsx and cleans up after itself.
 */
export function SiteBehaviour() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document | Window, type: K | string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      cleanups.push(() => el.removeEventListener(type, fn, opts));
    };

    document.documentElement.classList.add("js");
    cleanups.push(() => document.documentElement.classList.remove("js"));

    const header = document.querySelector<HTMLElement>(".site-header");
    const nav = document.getElementById("site-nav");
    const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
    if (!header || !nav || !toggle) return;

    // Solid header once the user scrolls past the hero top
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    on(window, "scroll", onScroll, { passive: true });

    // Mobile menu
    const setMenu = (open: boolean) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.classList.toggle("is-open", open);
      header.classList.toggle("menu-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    };
    on(toggle, "click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
    on(nav, "click", (e) => { if ((e.target as Element).closest("a")) setMenu(false); });
    on(document, "keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") setMenu(false); });
    cleanups.push(() => { document.body.style.overflow = ""; });

    // Highlight the nav link for the section in view
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]:not(.btn)'));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === `#${entry.target.id}`));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.map((a) => document.querySelector(a.getAttribute("href")!)).forEach((s) => s && spy.observe(s));
    cleanups.push(() => spy.disconnect());

    // Reveal-on-scroll
    const revealer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));
    cleanups.push(() => revealer.disconnect());

    // Activity filter
    const chips = Array.from(document.querySelectorAll<HTMLButtonElement>(".chip"));
    const cards = Array.from(document.querySelectorAll<HTMLElement>("#activity-grid .card"));
    chips.forEach((chip) => on(chip, "click", () => {
      const filter = chip.dataset.filter;
      chips.forEach((c) => {
        c.classList.toggle("is-active", c === chip);
        c.setAttribute("aria-pressed", String(c === chip));
      });
      cards.forEach((card) => {
        card.hidden = filter !== "all" && card.dataset.cat !== filter;
        card.classList.add("is-visible");
      });
    }));

    // "Get involved" cards pre-select the contact topic
    const topic = document.getElementById("topic") as HTMLSelectElement | null;
    document.querySelectorAll<HTMLElement>(".involve-card[data-topic]").forEach((card) => {
      on(card, "click", () => { if (topic) topic.value = card.dataset.topic ?? topic.value; });
    });

    // Contact form
    const form = document.getElementById("contact-form") as HTMLFormElement | null;
    if (form) {
      const status = form.querySelector<HTMLElement>(".form-status")!;
      const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const setStatus = (text: string, kind: "ok" | "error" | "") => {
        status.textContent = text;
        status.className = `form-status${kind ? ` is-${kind}` : ""}`;
      };

      on(form, "submit", async (e) => {
        e.preventDefault();
        let firstInvalid: HTMLInputElement | HTMLTextAreaElement | null = null;
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[required]").forEach((field) => {
          const ok = field.checkValidity() && field.value.trim() !== "";
          field.setAttribute("aria-invalid", String(!ok));
          if (!ok && !firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) {
          setStatus("Please fill in your name, a valid email and a message.", "error");
          (firstInvalid as HTMLElement).focus();
          return;
        }

        const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
        const openEmailApp = () => {
          const subject = `Website enquiry: ${data.topic}`;
          const body = `${data.message}\n\n— ${data.name} (${data.email})`;
          window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          setStatus("Thanks! Your email app should open with your message ready to send.", "ok");
        };
        if (!CONTACT_ENDPOINT) return openEmailApp();

        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
        setStatus("", "");
        try {
          const res = await fetch(CONTACT_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok || !result.ok) throw new Error(result.error || "Something went wrong.");
          form.reset();
          setStatus("Thank you! Your message has been sent — we'll get back to you soon.", "ok");
        } catch (err) {
          // Function unreachable (offline, not deployed yet): fall back to the visitor's email app.
          if (err instanceof TypeError) openEmailApp();
          else setStatus(`${(err as Error).message} You can also call us on ${PHONE}.`, "error");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send message";
        }
      });
    }

    const year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
