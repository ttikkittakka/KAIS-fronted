import type { NextConfig } from "next";

// Same-origin proxy to the Hono server in backend/.
const backend = process.env.BACKEND_URL || "http://localhost:8787";

const nextConfig: NextConfig = {
  rewrites: async () => [{ source: "/api/v1/:path*", destination: `${backend}/v1/:path*` }],
};

export default nextConfig;
