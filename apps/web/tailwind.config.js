/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        surface: '#111827',
        'surface-border': '#1f293d',
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
        },
      },
    },
  },
  plugins: [],
};
