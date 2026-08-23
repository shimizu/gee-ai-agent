// ESLint 設定（flat config）。
// React + React Refresh のルールを適用し、ブラウザ/エージェント層で使うグローバルを宣言する。
// 流用元: reference/web-gis-ai-agent/eslint.config.js
import eslintReact from '@eslint-react/eslint-plugin'
import eslint from '@eslint/js'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    // dist（ビルド成果物）と reference（別プロジェクトの参照実装）は lint 対象外。
    ignores: ['dist', 'reference'],
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [eslint.configs.recommended, eslintReact.configs.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        DOMException: 'readonly',
        globalThis: 'readonly',
        performance: 'readonly',
        createImageBitmap: 'readonly',
        ImageData: 'readonly',
        HTMLDialogElement: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
    rules: {
      '@eslint-react/dom-no-unsafe-target-blank': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
])
