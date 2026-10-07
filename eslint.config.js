import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Rules both sides follow: no unused code, no leftover console debugging, modern declarations,
// and no deeply nested code.
const sharedRules = {
  'no-unused-vars': 'error',
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-var': 'error',
  'prefer-const': 'error',
  'max-depth': ['warn', 3],
}

export default defineConfig([
  globalIgnores(['dist', 'client', 'server/uploads']),

  // Frontend (React + Vite)
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...sharedRules,
      // These two come from the React Compiler preset. Fixing them means restructuring component
      // logic, which this housekeeping pass must not do, so they report as warnings.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      // No vanilla DOM work in React (use refs and state). Listeners on window/document inside a
      // useEffect with cleanup, and window.print(), are the allowed exceptions.
      'no-restricted-syntax': ['warn',
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)$/]",
          message: 'Use a React ref or state instead of querying the DOM.',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name='addEventListener']",
          message: 'Only inside a useEffect that removes the listener in its cleanup (outside click, resize).',
        },
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property > Literal.value",
          message: 'Use a CSS class for fixed values. Inline style is only for values computed at runtime.',
        },
      ],
    },
  },

  // Backend (Node + Express, CommonJS)
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: sharedRules,
  },

  // Tooling files at the project root
  {
    files: ['vite.config.js', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: sharedRules,
  },
])
