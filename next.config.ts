import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate the opt-in read-only diagnostic server from the user's running UI.
  distDir: process.env.ONESTEP_NEXT_DB_DIAGNOSTIC === 'read-only-once'
    ? '.env.phase3b-ab/next-diagnostic-build' : '.next',
};

export default nextConfig;
