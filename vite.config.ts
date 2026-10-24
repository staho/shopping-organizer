import { defineConfig } from "vite";

export default defineConfig({
  // `data/shopping.json` is the only source file. Vite serves it at /shopping.json.
  publicDir: "data",
  server: {
    host: "127.0.0.1",
    port: 43123,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 43123,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
