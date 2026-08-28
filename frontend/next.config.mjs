/** @type {import('next').NextConfig} */

// The browser calls the API same-origin at /api/*, and Next proxies it to the
// backend server-side. This avoids CORS and cross-site cookies, so the app works
// over localhost, the LAN IP, or any device — and the backend stays on localhost.
const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
