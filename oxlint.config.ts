import { config } from './src/lint/index.js';

// disbord自身は@/エイリアスを持たず相対importで書かれているため、
// disbord/lintが標準で持つno-restricted-imports(相対import禁止)だけ無効化する。
export default {
  extends: [config],
  rules: {
    'no-restricted-imports': 'off',
  },
};
