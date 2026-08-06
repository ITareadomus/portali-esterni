import type { NextConfig } from "next";

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const isDevelopment = process.env.NODE_ENV === "development";
const allowedOrigins = isDevelopment ? parseCsv(process.env.ADAM_WEB_ALLOWED_ORIGINS) : [];

const nextConfig: NextConfig = {
  transpilePackages: ["@adam/types"],
};

if (isDevelopment && allowedOrigins.length > 0) {
  nextConfig.allowedDevOrigins = allowedOrigins;
  nextConfig.experimental = {
    serverActions: {
      allowedOrigins,
    },
  };
}

export default nextConfig;
