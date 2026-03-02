import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(rawPath: string | undefined): string {
  if (rawPath === undefined || rawPath.trim().length === 0) {
    return "/";
  }
  let value = rawPath.trim();
  if (!value.startsWith("/")) {
    value = `/${value}`;
  }
  if (!value.endsWith("/")) {
    value = `${value}/`;
  }
  return value;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
});
