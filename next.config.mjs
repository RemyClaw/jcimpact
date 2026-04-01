/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'mapbox-gl': 'mapbox-gl',
    };
    return config;
  },

  // Security headers — applied to every page
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent the site from being embedded in iframes on other sites (clickjacking protection)
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Tell browsers to trust the declared content type (prevents MIME sniffing attacks)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Control what info is sent when clicking links to other sites
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Block access to browser features the site doesn't need
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Prevent XSS attacks — only allow scripts/styles from trusted sources
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://api.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https://*.mapbox.com",
              "font-src 'self' https://api.mapbox.com",
              "connect-src 'self' https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com https://geocode.arcgis.com https://docs.google.com",
              "worker-src 'self' blob:",
              "frame-src https://docs.google.com",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Disable source maps in production (don't expose source code)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
