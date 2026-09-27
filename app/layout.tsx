import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AZO Studio | Active Zone Outdoor",
  description: "Manage contributor albums from Google Drive and Google Photos for the public Active Zone Outdoor gallery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
