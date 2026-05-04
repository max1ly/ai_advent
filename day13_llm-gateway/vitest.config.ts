import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DEEPSEEK_API_KEY: "sk-test-placeholder-for-vitest",
    },
  },
});
