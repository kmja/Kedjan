import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The whole game is static: a day object is under a kilobyte, so the build
  // is a plain bundle of HTML/JS/CSS plus a pregenerated calendar. No backend.
  base: process.env.KEDJAN_BASE ?? "/",
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
