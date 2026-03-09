import js      from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['src/assets/**']
  },
  js.configs.recommended,
  {
    files:   ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType:  'module',
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'no-undef':              'error',
      'no-console':            'off',

      // catch real bugs without TS
      'no-param-reassign':     'warn',
      'consistent-return':     'error',  // forces you to always return or never return in a function
      'eqeqeq':                'error',  // no == only ===
      'no-shadow':             'error',  // catches variable shadowing bugs

      // async/await safety
      'no-await-in-loop':      'warn',
      'no-promise-executor-return': 'error',

      // ESM specific
      'no-duplicate-imports':  'error',
    }
  }
];