import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/vendor/**']},
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({...config, files: ['**/*.ts']})),
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {...globals.browser, ...globals.webextensions, ...globals.node},
      parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname},
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {'@typescript-eslint/require-await': 'off'},
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {globals: globals.node},
  },
);
