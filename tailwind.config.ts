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
          DEFAULT: '#0f1117',
          card: '#161b27',
          border: '#1e2535',
          muted: '#252d3d',
        },
        accent: {
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#3b82f6',
          green: '#22c55e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
