import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#080c14',
          card: '#0e1420',
          elevated: '#131929',
          border: '#1a2234',
          muted: '#1e2840',
        },
        accent: {
          red: '#f43f5e',
          amber: '#f59e0b',
          blue: '#3b82f6',
          green: '#10b981',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
