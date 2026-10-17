import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Build output and fixtures (also inside nested worktrees), tool folders
    ignores: ['**/.output/', '**/.wxt/', 'tests/fixtures/', '.worktrees/', '.superpowers/', '.claude/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
