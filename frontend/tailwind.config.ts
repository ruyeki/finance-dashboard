import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        // Retuned for the hairline-grid redesign (was #171a21 / #1e222b / #2a2f3a).
        panel: "#14171d",
        panel2: "#1a1f27",
        line: "#262b34",
        line2: "#1c212a",
        edge: "#3b4250",
        dim: "#5c6474",
        fg: "#eef1f6",
        muted: "#8b93a7",
        accent: "#5b8cff",
        good: "#3ecf8e",
        warn: "#f5a623",
        bad: "#ff6b6b",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Named roles from the design handoff type scale, so screens do not
      // repeat arbitrary pixel values.
      fontSize: {
        eyebrow: ["10px", { lineHeight: "1.2", letterSpacing: "0.1em" }],
        micro: ["11px", { lineHeight: "1.3" }],
        caption: ["12px", { lineHeight: "1.5" }],
        body: ["13px", { lineHeight: "1.55" }],
        h2: ["14px", { lineHeight: "1.3" }],
        title: ["20px", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        section: ["26px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        stat: ["28px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        hero: ["34px", { lineHeight: "1.1", letterSpacing: "-0.035em" }],
      },
    },
  },
  plugins: [],
};

export default config;
