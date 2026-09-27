import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Active Zone Studio",
  description: "A private home for Active Zone Outdoor photo albums.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
