import { defineConfig, type Plugin } from "vite";

function pagesRedirects(): Plugin {
  return {
    name: "pages-spa-redirects",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_redirects",
        source: "/*  /index.html  200\n",
      });
    },
  };
}

export default defineConfig({
  // `data/shopping.json` is the only source file. Vite serves it at /shopping.json.
  publicDir: "data",
  plugins: [pagesRedirects()],
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
