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
          DEFAULT: '#0A0F1C',   // page background
          card:    '#111827',   // card background
          elevated:'#111827',  // same as card
          border:  '#1F2937',  // row dividers, borders
          muted:   '#1F2937',  // muted fill
          nav:     '#0F172A',  // header, sidebar, nav
        },
        accent: {
          red:    '#EF4444',
          amber:  '#F59E0B',
          blue:   '#3B82F6',
          green:  '#22C55E',
          orange: '#F97316',
          gray:   '#9CA3AF',
          gold:   '#c4a832',
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
