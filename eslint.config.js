import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'vite.config.d.ts']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.browser
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-expressions': 'off',
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
)
