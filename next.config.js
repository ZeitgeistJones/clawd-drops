/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['essentia.js', 'audio-decode'],
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    return config
  },
}
module.exports = nextConfig
