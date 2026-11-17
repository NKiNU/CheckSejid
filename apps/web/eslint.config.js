import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      // Colours live in styles.css as tokens; no hex values in components.
      'no-restricted-syntax': ['error', { selector: 'Literal[value=/#[0-9a-fA-F]{6}\\b/]', message: 'Use a colour token from styles.css.' }],
    },
  },
  { files: ['src/**/*.test.{ts,tsx}', 'src/data/**'], rules: { 'no-restricted-syntax': 'off' } },
);
