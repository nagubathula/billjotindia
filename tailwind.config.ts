import type { Config } from "tailwindcss";

// Theme colors come from CSS variables in app/globals.css (set up by shadcn).
// Don't redeclare colors here — Tailwind class names like `bg-primary` resolve
// via the shadcn-provided utility layer (`@import "shadcn/tailwind.css"`).
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
