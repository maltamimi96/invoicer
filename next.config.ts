import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  compress: true,
  // Barrel-import optimisation — without this, importing a single icon from
  // @phosphor-icons/react drags ~140 icons into the client bundle of every
  // route that touches @/components/ui/icons. Same story for framer-motion,
  // lucide-react, date-fns, recharts. With Next's compiler optimisation,
  // each named import resolves to its individual subpath so only what's
  // used ships.
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "framer-motion",
      "date-fns",
      "recharts",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "fonts.gstatic.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  // @sentry/nextjs is server-only here (dynamically imported inside
  // src/instrumentation.ts, gated on SENTRY_DSN) — keep it external so it never
  // gets bundled/transpiled into route chunks and stays out of the client build.
  serverExternalPackages: ["@react-pdf/renderer", "@sentry/nextjs"],
  // RFC 8414 / 9728 discovery lives at /.well-known/* by spec, but App Router
  // dot-folders are flaky — serve them from plain API routes via rewrites so
  // the public URL stays correct.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/meta/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/api/mcp", destination: "/api/oauth/meta/authorization-server" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/meta/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: "/api/oauth/meta/protected-resource" },
    ];
  },
  async headers() {
    return [
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/icons/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
