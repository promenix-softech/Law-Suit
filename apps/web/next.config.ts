import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@civil-suits/domain"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
