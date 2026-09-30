import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AZO Moments | Active Zone Outdoor",
  description: "Active Zone Outdoor events, participant photo uploads and published albums.",
  icons: { icon: { url: "/assets/img/favicon.svg", type: "image/svg+xml" }, apple: "/assets/img/apple-touch-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
