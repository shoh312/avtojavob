/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff1f1', 100: '#ffe0e1', 200: '#ffc6c8', 300: '#ff9da1', 400: '#ff6369', 500: '#f8333b', 600: '#e5161f', 700: '#c10f17', 800: '#a01017', 900: '#84141a' },
        ink: { DEFAULT: '#111114', 2: '#3a3a42', 3: '#6b6b76', 4: '#a1a1ab' },
        line: '#ececf0',
        soft: '#f7f7f9',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(17,17,20,.04), 0 1px 1px rgba(17,17,20,.03)',
        pop: '0 12px 32px -8px rgba(17,17,20,.18), 0 2px 6px rgba(17,17,20,.06)',
        node: '0 1px 2px rgba(17,17,20,.06), 0 8px 24px -12px rgba(17,17,20,.18)',
      },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
}
