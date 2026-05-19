/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          950: '#060B12',
          900: '#0A1020',
          800: '#0D1525',
          700: '#111E30',
          600: '#162236',
        },
        accent:  '#00FFD1',
        success: '#00FF88',
        danger:  '#FF2D55',
        warning: '#FFD600',
        purple:  '#BF5FFF',
        blue:    '#4DACFF',
        orange:  '#FF6B00',
      },
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'] },
    },
  },
  plugins: [],
};
