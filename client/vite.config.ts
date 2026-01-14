import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },

  // 🔥 NECESSÁRIO PARA RODAR NO RAILWAY
  preview: {
    host: true,
    port: 8080,
    allowedHosts: [
      "zeno-crm-production.up.railway.app",
      ".up.railway.app",
    ],
  },
});
