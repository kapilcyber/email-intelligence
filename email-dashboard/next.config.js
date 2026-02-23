/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid webpack PackFileCacheStrategy ENOENT rename errors on Windows/OneDrive
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
};
module.exports = nextConfig;
