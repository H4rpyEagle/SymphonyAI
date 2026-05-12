/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        robotIdle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        robotWork: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "45%": { transform: "translateY(-4px) scale(1.03)" },
        },
        agentScan: {
          "0%": { top: "14%", opacity: "0.95" },
          "100%": { top: "76%", opacity: "0.12" },
        },
        antennaWiggle: {
          "0%, 100%": { transform: "rotate(-10deg)" },
          "50%": { transform: "rotate(10deg)" },
        },
        robotSleep: {
          "0%, 100%": { transform: "translateY(3px) rotate(-1.5deg)" },
          "50%": { transform: "translateY(0) rotate(1.5deg)" },
        },
        zzzFloat: {
          "0%, 100%": { transform: "translate(0, 6px) scale(1)", opacity: "0.25" },
          "50%": { transform: "translate(4px, -2px) scale(1.08)", opacity: "0.75" },
        },
        zzzFloat2: {
          "0%, 100%": { transform: "translate(0, 2px) scale(0.95)", opacity: "0.2" },
          "50%": { transform: "translate(3px, -6px) scale(1)", opacity: "0.65" },
        },
      },
      animation: {
        "robot-idle": "robotIdle 3.2s ease-in-out infinite",
        "robot-work": "robotWork 0.7s ease-in-out infinite",
        "robot-sleep": "robotSleep 4.8s ease-in-out infinite",
        "agent-scan": "agentScan 1.1s ease-in-out infinite",
        "antenna-wiggle": "antennaWiggle 0.48s ease-in-out infinite",
        "zzz-a": "zzzFloat 2.6s ease-in-out infinite",
        "zzz-b": "zzzFloat2 2.9s ease-in-out 0.4s infinite",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#0a0c10",
          900: "#11141c",
          800: "#1a1f2e",
          700: "#252b3d",
        },
        accent: {
          q1: "#f43f5e",
          q2: "#38bdf8",
          q3: "#fbbf24",
          q4: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
};
