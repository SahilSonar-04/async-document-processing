module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--bg-surface-raised) / <alpha-value>)",
        subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        strong: "rgb(var(--border-strong) / <alpha-value>)",
        primary: "rgb(var(--text-primary) / <alpha-value>)",
        secondary: "rgb(var(--text-secondary) / <alpha-value>)",
        tertiary: "rgb(var(--text-tertiary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "10px",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "translateX(-60%)" },
          "100%": { transform: "translateX(220%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blip: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.015)" },
          "100%": { transform: "scale(1)" },
        },
        flash: {
          "0%": { backgroundColor: "rgb(var(--accent) / 0.16)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        sweep: "sweep 1.3s ease-in-out infinite",
        "fade-up": "fade-up 160ms ease-out both",
        blip: "blip 150ms ease-out",
        flash: "flash 900ms ease-out",
      },
    },
  },
  plugins: [],
};
