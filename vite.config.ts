import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "mytodo",
        short_name: "mytodo",
        description: "本地优先的待办、习惯与专注",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f4f1eb",
        theme_color: "#f4f1eb",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        share_target: {
          action: "/",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,webmanifest}"],
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
