import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ тоже содержит имена классов (цвета плашек лежали там, и половина
    // палитры не попадала в сборку — классы рисовались пустотой).
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // B2B portal palette — strict flat design (Autodoc / RockAuto vibe)
        sidebar: {
          DEFAULT: "#222222",
          hover: "#2e2e2e",
          active: "#1a1a1a",
          border: "#333333",
        },
        accent: {
          DEFAULT: "#E53935", // primary red — buttons & accents
          dark: "#C62828",
          light: "#EF5350",
        },
        ink: "#1f1f1f",
        muted: "#6b7280",
        line: "#e5e7eb",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
