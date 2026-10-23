/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rsgo: {
          50: "#FAF7F2",
          100: "#F3EEE6",
          200: "#EAE3D9",
          300: "#D6CDEA",
          400: "#BFD7E3",
          500: "#A8B89A",
          600: "#7A7068",
          700: "#5A524D",
          800: "#3A3430",
          900: "#2B2623",
          950: "#1F1B19",
        },
        orange: {
          50: "#FFE3E7",
          100: "#FFD0D6",
          200: "#F2C9C4",
          400: "#F08A97",
          500: "#E36B7A",
          600: "#E60023",
          700: "#C9001F",
          800: "#A00019",
        },
        primary: {
          DEFAULT: "#E60023",
          soft: "#FFE3E7",
        },
        sage: "#A8B89A",
        blush: "#F2C9C4",
        sand: "#E8D8BE",
        sky: "#BFD7E3",
        lavender: "#D6CDEA",
        success: "#5E9B6E",
        warning: "#E3A857",
        error: "#D6455D",
        surface: "#FFFFFF",
        surfaceSoft: "#F3EEE6",
        bg: "#FAF7F2",
      },
      fontFamily: {
        sans: ["Inter", "Poppins", "system-ui", "sans-serif"],
        display: ["DM Serif Display", "Playfair Display", "serif"],
        serif: ["DM Serif Display", "Playfair Display", "serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(43,38,35,0.06)",
        "soft-lg": "0 12px 32px rgba(43,38,35,0.08)",
        card: "0 4px 16px rgba(43,38,35,0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
