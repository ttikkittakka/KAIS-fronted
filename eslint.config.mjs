import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prebuilt Rive bundles and a separate downloaded CLI project, not app sources.
    "design-output/rive.js",
    "public/design-preview/rive.js",
    "ui-ux-pro-max-skill-main/**",
  ]),
]);

export default eslintConfig;
