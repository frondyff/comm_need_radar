import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The PDF engine is loaded only after a user requests a flyer. Keep its
    // explicit lazy-load budget separate from the initial application bundle.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-leaflet") || id.includes("/leaflet/")) return "maps";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("html2canvas")) return "capture-engine";
          if (
            id.includes("/jspdf/") ||
            id.includes("/dompurify/") ||
            id.includes("/canvg/") ||
            id.includes("/fast-png/")
          ) return "pdf-engine";
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
})
