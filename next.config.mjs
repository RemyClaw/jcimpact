/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't leak X-Powered-By: Next.js header (minor fingerprint reduction)
  poweredByHeader: false,

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
          // Force HTTPS for 2 years; include subdomains; allow HSTS preload submission
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://api.mapbox.com https://*.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://*.mapbox.com",
              "img-src 'self' data: blob: https://*.mapbox.com https://*.mapbox.cn https://*.cartocdn.com https://*.basemaps.cartocdn.com",
              "font-src 'self' data: https://api.mapbox.com https://*.mapbox.com https://*.cartocdn.com",
              "connect-src 'self' https://*.mapbox.com https://*.mapbox.cn https://api.mapbox.com https://events.mapbox.com https://geocode.arcgis.com https://docs.google.com https://*.cartocdn.com https://basemaps.cartocdn.com",
              "worker-src 'self' blob:",
              "child-src blob:",
              "frame-src 'self' https://docs.google.com",
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
