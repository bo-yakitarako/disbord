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
    // 相対import(./や../)を禁止し@/絶対パスimportを必須にする。
    // "./*"のような1階層のみのglobだと"../../foo"のようなネストを見逃すため"**"を使う。
    // disbord自身は@/エイリアスを持たず相対importで書かれているため、disbord/oxlint.config.tsで
    // このルールだけ'off'に上書きしている。
    'no-restricted-imports': ['error', { patterns: ['./**', '../**'] }],
  },
  env: {
    builtin: true,
  },
  ignorePatterns: ['.disbord/*'],
};
