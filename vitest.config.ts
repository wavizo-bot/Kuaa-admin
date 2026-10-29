import { defineConfig } from "vitest/config";

// Configuração própria do Vitest (não herda a do app: os testes do motor são puros, sem plugin React).
export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts"],
  },
});
