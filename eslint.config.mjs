import importX from 'eslint-plugin-import-x';
import noSecrets from 'eslint-plugin-no-secrets';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs['flat/recommended'],
  sonarjs.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    plugins: { 'no-secrets': noSecrets },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          project: './tsconfig.eslint.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      'sonarjs/cognitive-complexity': ['error', 10],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      // TypeScript 6's type representation makes these sonarjs rules emit false
      // positives (and they duplicate tsc's own type checking). Re-enable once
      // eslint-plugin-sonarjs officially supports TS 6.
      'sonarjs/function-return-type': 'off',
      'sonarjs/argument-type': 'off',
      'max-lines-per-function': [
        'warn',
        // biome-ignore lint/style/useNamingConvention: ESLint rule option name is IIFEs (not camelCase)
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 5 }],
      'max-depth': ['error', { max: 5 }],
      'max-statements': ['warn', { max: 20 }, { ignoreTopLevelFunctions: true }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'unicorn/error-message': 'error',
      'unicorn/catch-error-name': 'error',
      'unicorn/custom-error-definition': 'error',
      'import-x/no-relative-parent-imports': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/order': 'off',
      'import-x/no-duplicates': 'off',
      'no-secrets/no-secrets': ['error', { tolerance: 4.5 }],
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1, 2, 10, 100, 1000],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreClassFieldInitialValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          enforceConst: true,
        },
      ],
      'unicorn/prevent-abbreviations': [
        'error',
        {
          replacements: {
            props: false,
            ref: false,
            ctx: false,
            req: false,
            res: false,
            err: false,
            db: false,
            id: false,
            env: false,
            fn: false,
            dir: false,
            src: false,
            dest: false,
            tmp: false,
            config: false,
            args: false,
          },
        },
      ],
      'unicorn/no-null': 'off',
      // .sort() on freshly-created arrays is fine; toSorted() would require an ES2023 lib bump.
      'unicorn/no-array-sort': 'off',
      'unicorn/filename-case': ['error', { case: 'kebabCase', multipleFileExtensions: true }],
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      'import-x/no-relative-parent-imports': 'off',
      // `__tests__` is the conventional vitest/jest directory name (not kebab-case).
      'unicorn/filename-case': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.config.mjs',
      'vitest.config.ts',
      // Generated query builder — excluded from tsconfig, so typed linting can't resolve it.
      'dbschema/**',
      // Local git worktrees (gitignored) — not part of the project.
      '.worktrees/**',
    ],
  },
);
