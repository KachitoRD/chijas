import js from "@eslint/js";
import html from "eslint-plugin-html";
import globals from "globals";

export default [
  {
    ignores: [".agents/**", ".firebase/**", "node_modules/**"],
  },
  {
    files: ["*.js", "*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        Cropper: "readonly",
        tailwind: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
