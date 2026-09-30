import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import "./site.css";

const title = "Active Zone Outdoor — Learning not confined within four walls";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description:
    "Active Zone Outdoor is a non-profit youth organisation in Larnaca, Cyprus, connecting young people with better mental health through inclusive outdoor sports, Erasmus+ youth exchanges and volunteering.",
  icons: { icon: { url: "/assets/img/favicon.svg", type: "image/svg+xml" }, apple: "/assets/img/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    title,
    description: "Inclusive outdoor sports, Erasmus+ youth exchanges and volunteering in Larnaca, Cyprus.",
    url: "/",
    images: ["/assets/img/logo-official-512.png"],
  },
};

export const viewport: Viewport = { themeColor: "#0f3d2e" };

const organisation = {
  "@context": "https://schema.org",
  "@type": "NGO",
  name: "Active Zone Outdoor",
  url: `${siteUrl}/`,
  logo: `${siteUrl}/assets/img/logo-official-512.png`,
  slogan: "Learning not confined within four walls",
  foundingDate: "2019",
  telephone: "+35799541017",
  address: { "@type": "PostalAddress", streetAddress: "Riga Fereou 10", addressLocality: "Klavdia, Larnaca", addressCountry: "CY" },
};

// The website has its own root layout and stylesheet, so its styles never mix with the events app's (app/(moments)).
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organisation) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
