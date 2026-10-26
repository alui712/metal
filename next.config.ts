import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Vercel hosts only the fixture demo (no models, no media processing): keep the
  // on-device AI runtimes out of the functions, and ship the migrations for the
  // in-memory database (src/server/db/client.ts).
  ...(process.env.VERCEL
    ? {
        outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
        outputFileTracingExcludes: {
          "/**": ["./node_modules/onnxruntime-node/**", "./node_modules/onnxruntime-web/**", "./node_modules/@huggingface/transformers/**", "./node_modules/sharp/**", "./node_modules/@img/**"],
        },
      }
    : {}),
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
