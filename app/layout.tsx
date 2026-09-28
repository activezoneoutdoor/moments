import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AZO Studio | Active Zone Outdoor",
  description: "Active Zone Outdoor events, participant photo uploads and published albums.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
