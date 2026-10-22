import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig(({ mode }) => ({
  define: {
    __STOREFRONT_EXAMPLE__: JSON.stringify(
      mode === "coffee" ? "coffee" : "outdoor",
    ),
  },
  plugins: [react(), cloudflare({ inspectorPort: false })],
}));
