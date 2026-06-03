import { defineConfig } from "vite";

export default defineConfig({
  base: "/ethr-manager/",
  server: {
    host: "0.0.0.0",
  },
  build: {
    minify: false,
    cssMinify: false,
  },
});
