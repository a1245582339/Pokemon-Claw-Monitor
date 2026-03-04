import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    assetsDir: "_assets",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3060",
      "/assets": "http://localhost:3060",
    },
  },
});
