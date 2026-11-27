import type { NextConfig } from "next";

const nextConfig = {\n  serverExternalPackages: ['ffmpeg-static', 'msedge-tts'],\n  outputFileTracingIncludes: { '/api/**/*': ['./node_modules/ffmpeg-static/**/*', './public/fonts/**/*'] },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
