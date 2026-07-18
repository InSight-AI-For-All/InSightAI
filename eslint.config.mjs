import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({ baseDirectory: currentDirectory });

export default [
  ...compatibility.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "coverage/**", "node_modules/**"],
  },
];