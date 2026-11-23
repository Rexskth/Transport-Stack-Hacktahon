import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        seats: "rgb(var(--seats) / <alpha-value>)",
        standing: "rgb(var(--standing) / <alpha-value>)",
        crowded: "rgb(var(--crowded) / <alpha-value>)",
        unknown: "rgb(var(--unknown) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "sans-serif"],
      },
      boxShadow: {
        float: "0 10px 40px -12px rgb(0 0 0 / 0.35), 0 2px 8px -2px rgb(0 0 0 / 0.15)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseRing: { "0%": { transform: "scale(.6)", opacity: ".8" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
      },
      animation: { shimmer: "shimmer 1.4s infinite", pulseRing: "pulseRing 1.8s ease-out infinite" },
    },
  },
  plugins: [],
};
export default config;
