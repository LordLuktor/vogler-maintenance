import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Named away from the default "assets" so the built-in static bundle directory doesn't
  // collide with the app's own /assets route (nginx was 301-redirecting that page to the
  // static directory instead of falling through to index.html for the SPA router).
  build: {
    assetsDir: "static"
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/uploads": "http://localhost:3000"
    }
  }
});
