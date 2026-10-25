import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 1432, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          terminal: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-search"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  clearScreen: false,
});
