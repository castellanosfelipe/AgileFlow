import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        /* ── Tailwind backward-compat tokens ────────────────────────── */
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },

        /* ── AgileFlow extended tokens ───────────────────────────────── */

        canvas:  "hsl(var(--canvas))",
        surface: {
          "01": "hsl(var(--surface-01))",
          "02": "hsl(var(--surface-02))",
          "03": "hsl(var(--surface-03))"
        },
        "border-subtle": "hsl(var(--border-subtle))",
        "border-strong": "hsl(var(--border-strong))",

        brand: {
          DEFAULT:   "hsl(var(--brand-primary))",
          secondary: "hsl(var(--brand-secondary))"
        },
        "accent-data": "hsl(var(--accent-data))",

        status: {
          todo:      "hsl(var(--status-todo))",
          progress:  "hsl(var(--status-in-progress))",
          review:    "hsl(var(--status-in-review))",
          done:      "hsl(var(--status-done))",
          blocked:   "hsl(var(--status-blocked))",
          cancelled: "hsl(var(--status-cancelled))"
        },

        chart: {
          "01": "hsl(var(--chart-01))",
          "02": "hsl(var(--chart-02))",
          "03": "hsl(var(--chart-03))",
          "04": "hsl(var(--chart-04))",
          "05": "hsl(var(--chart-05))",
          "06": "hsl(var(--chart-06))"
        }
      },

      borderRadius: {
        none: "0",
        sm:   "4px",
        md:   "6px",
        lg:   "8px",
        xl:   "12px",
        full: "9999px"
      },

      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body:    ["var(--font-body)",    "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "monospace"]
      },

      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4", fontWeight: "400" }],
        xs:    ["11px", { lineHeight: "1.4", fontWeight: "400" }],
        sm:    ["12px", { lineHeight: "1.5", fontWeight: "400" }],
        base:  ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        md:    ["16px", { lineHeight: "1.5", fontWeight: "500" }],
        lg:    ["18px", { lineHeight: "1.4", fontWeight: "600" }],
        xl:    ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "2xl": ["32px", { lineHeight: "1.2", fontWeight: "700" }],
        "3xl": ["48px", { lineHeight: "1.1", fontWeight: "800" }]
      },

      boxShadow: {
        card:     "0 1px 3px hsl(222 26% 4% / 0.3), 0 1px 2px hsl(222 26% 4% / 0.2)",
        elevated: "0 4px 16px hsl(222 26% 4% / 0.4), 0 2px 4px hsl(222 26% 4% / 0.2)",
        command:  "0 16px 48px hsl(222 26% 4% / 0.6), 0 4px 8px hsl(222 26% 4% / 0.3)",
        dragging: "0 12px 32px hsl(222 26% 4% / 0.6)"
      },

      transitionDuration: {
        micro: "150",
        base:  "250",
        long:  "350",
        draw:  "400"
      },

      transitionTimingFunction: {
        "ease-out-sharp": "cubic-bezier(0.0, 0.0, 0.2, 1)",
        "ease-in-sharp":  "cubic-bezier(0.4, 0.0, 1.0, 1)",
        "ease-both":      "cubic-bezier(0.4, 0.0, 0.2, 1)"
      },

      keyframes: {
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to:   { transform: "translateX(0)",    opacity: "1" }
        },
        "fade-scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to:   { opacity: "1", transform: "scale(1)" }
        },
        "skeleton-shimmer": {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" }
        },
        "drop-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%":      { opacity: "1" }
        }
      },

      animation: {
        "slide-in-right": "slide-in-right 250ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "fade-scale-in":  "fade-scale-in 150ms cubic-bezier(0.0, 0.0, 0.2, 1)",
        "skeleton":       "skeleton-shimmer 1.5s ease-in-out infinite",
        "drop-pulse":     "drop-pulse 1s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
