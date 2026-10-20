import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@civil-suits/domain", "@civil-suits/templates"],
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
