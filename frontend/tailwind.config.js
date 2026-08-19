/** @type {import('tailwindcss').Config} */
export default {
  // The app's own theme toggle sets class="dark-mode" on <html> (not
  // Tailwind's default "dark"). Without this line, Tailwind falls back to
  // its default darkMode: 'media' strategy — which only responds to the
  // OS-level prefers-color-scheme setting and completely ignores any
  // class the app toggles via JavaScript. Every `dark:` prefixed utility
  // class in this codebase has been silently inert whenever the device's
  // OS setting didn't happen to match the in-app toggle. This explicit
  // selector tells Tailwind to activate `dark:` variants based on the
  // actual app-controlled class instead.
  darkMode: ['selector', '.dark-mode'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#0B0F19',
        'brand-elevated': '#151D30',
        'brand-card': '#1E293B',
        'risk-critical': '#EF4444',
        'risk-high': '#F97316',
        'risk-medium': '#FBBF24',
        'risk-low': '#10B981',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.5)',
        'glow-orange': '0 0 15px rgba(249, 115, 22, 0.5)',
      }
    },
  },
  plugins: [],
}
