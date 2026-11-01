import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    strictPort: true,
    proxy: { "/api": process.env.API_TARGET ?? "http://127.0.0.1:8787" },
  },
  build: {
    rolldownOptions: { input: { main: "index.html", verify: "verify.html" } },
  },
});
