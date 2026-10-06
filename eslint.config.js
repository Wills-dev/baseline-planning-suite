import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const restrict = (patterns) => [
  'error',
  {
    patterns: [
      {
        group: patterns,
        message:
          'Respect workspace ownership; share intentional public APIs through packages.',
      },
    ],
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },
  ...['shell', 'people', 'delivery'].map((app) => ({
    files: [`apps/${app}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': restrict(
        ['shell', 'people', 'delivery']
          .filter((other) => other !== app)
          .flatMap((other) => [
            `@baseline/${other}`,
            `@baseline/${other}/**`,
            `**/${other}`,
            `**/${other}/**`,
          ]),
      ),
    },
  })),
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        'react',
        'react/**',
        'react-dom',
        'react-dom/**',
        '@baseline/shell',
        '@baseline/shell/**',
        '@baseline/people',
        '@baseline/people/**',
        '@baseline/delivery',
        '@baseline/delivery/**',
        '**/apps/**',
      ]),
    },
  },
);
