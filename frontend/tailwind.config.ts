import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        panel: "#171a21",
        panel2: "#1e222b",
        line: "#2a2f3a",
        muted: "#8b93a7",
        accent: "#5b8cff",
        good: "#3ecf8e",
        warn: "#f5a623",
        bad: "#ff6b6b",
      },
    },
  },
  plugins: [],
};

export default config;
