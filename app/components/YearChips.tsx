"use client";

import { useState } from "react";
import { eventYear, type AzoEvent } from "@/lib/events";

/** Year filter over a list of events: the years present (in list order), the chosen year and the filtered list. */
export function useYearFilter<T extends Pick<AzoEvent, "starts_at">>(events: T[]) {
  const [year, setYear] = useState<string | null>(null);
  const years = Array.from(new Set(events.map(eventYear)));
  const activeYear = year && years.includes(year) ? year : null;
  const filtered = activeYear ? events.filter((e) => eventYear(e) === activeYear) : events;
  const counts = Object.fromEntries(years.map((y) => [y, events.filter((e) => eventYear(e) === y).length]));
  return { years, counts, activeYear, setYear, filtered };
}

type Props = { years: string[]; counts: Record<string, number>; activeYear: string | null; onChange: (year: string | null) => void };

/** "All" plus one chip per year; hidden when the events span a single year. */
export function YearChips({ years, counts, activeYear, onChange }: Props) {
  if (years.length < 2) return null;
  return (
    <div className="year-chips" role="group" aria-label="Filter by year">
      <button aria-pressed={!activeYear} className={!activeYear ? "active" : ""} onClick={() => onChange(null)}>All</button>
      {years.map((y) => (
        <button key={y} aria-pressed={activeYear === y} className={activeYear === y ? "active" : ""} onClick={() => onChange(y)}>
          {y} <span>{counts[y]}</span>
        </button>
      ))}
    </div>
  );
}
