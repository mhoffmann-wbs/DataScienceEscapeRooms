import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Only the net/ adapters may talk to Trystero; everything else goes through Transport.
      'no-restricted-imports': ['error', { patterns: [{ group: ['trystero', 'trystero/*'], message: 'Use the Transport interface from src/net instead.' }] }],
    },
  },
  {
    files: ['src/net/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
