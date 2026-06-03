import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data/ files are included in any serverless function bundle.
  // The page is statically pre-rendered (loadCityModel runs at build time),
  // but this guards against accidental dynamic rendering in future.
  outputFileTracingIncludes: {
    "/": ["./data/**"],
  },
};

export default nextConfig;
