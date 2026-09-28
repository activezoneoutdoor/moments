/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Emit folder/index.html pages so links like /upload/?t=… resolve on GitHub Pages.
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
};

export default nextConfig;
