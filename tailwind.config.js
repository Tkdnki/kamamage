/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dofus: {
          bg: '#0d121f',
          panel: '#151f32',
          panelLight: '#1e2c45',
          accent: '#e6c15c',
          accentHover: '#f5d376',
          kama: '#ffcc00',
          dark: '#070a12',
        }
      },
      boxShadow: {
        'glow-amber': '0 0 15px rgba(230, 193, 92, 0.15)',
        'glow-amber-lg': '0 0 25px rgba(230, 193, 92, 0.3)',
        'glow-emerald': '0 0 15px rgba(16, 185, 129, 0.2)',
        'glow-rose': '0 0 15px rgba(244, 63, 94, 0.2)',
      }
    },
  },
  plugins: [],
}
