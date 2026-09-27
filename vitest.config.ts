import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      env: {
        VITE_API_BASE_URL: "http://api.test/api/v1",
        VITE_SHORT_URL_HOST: "sho.rt",
      },
    },
  }),
);
