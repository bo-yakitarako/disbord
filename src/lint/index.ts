export const config = {
  plugins: ['typescript', 'oxc', 'unicorn'],
  categories: {},
  rules: {
    complexity: ['error', { max: 11 }],
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    'no-shadow': 'off',
    'no-use-before-define': 'off',
    'class-methods-use-this': 'off',
  },
  env: {
    builtin: true,
  },
};
