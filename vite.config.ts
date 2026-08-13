import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: resolve(import.meta.dirname, "index.html"),
                background: resolve(
                    import.meta.dirname,
                    "src/background/index.ts",
                ),
                content: resolve(
                    import.meta.dirname,
                    "src/content/index.ts",
                ),
            },
            output: {
                entryFileNames: (chunkInfo) => {
                    if (chunkInfo.name === "background") return "background.js";
                    if (chunkInfo.name === "content") return "content.js";
                    return "assets/[name]-[hash].js";
                },
                chunkFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash].[ext]",
            },
        },
    },
});
