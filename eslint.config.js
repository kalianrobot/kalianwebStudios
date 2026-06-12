import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';

export default tseslint.config(
  { ignores: ['dist/**/*', 'node_modules/**/*', 'tests/**/*'] },

  // Firebase security rules lint
  firebaseRulesPlugin.configs['flat/recommended'],

  // TypeScript + React for src/
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      security.configs.recommended,
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // React hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript — useful but not overly strict
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'off',

      // Catch common bugs
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
    },
  }
);
