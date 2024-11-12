// @ts-check
import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";

import react from "@astrojs/react";

import netlify from "@astrojs/netlify";

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    react(),
  ],
  output: "server",
  adapter: netlify({
    edgeMiddleware: true,
  }),
  image: {
    domains: ["media.bckstg.app"],
  },
});