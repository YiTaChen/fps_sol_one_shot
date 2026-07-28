import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    strictPort: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 620,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
          return undefined;
        },
      },
    },
  },
});

