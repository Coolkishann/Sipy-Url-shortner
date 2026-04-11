/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./scripts/**/*.{js,ts,jsx,tsx}",
    "./public/scripts/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'snip-blue': '#6366f1',
        'snip-dark': '#0a0a0f',
      }
    },
  },
  plugins: [],
}
