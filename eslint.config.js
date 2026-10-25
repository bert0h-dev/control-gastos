import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'capturas/', 'data/'] },
  js.configs.recommended,
  {
    // Código del navegador
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    rules: {
      // El HTML generado usa data-action (ver action() en ui.js), nunca código en atributos ni funciones globales
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateElement[value.raw=/\\son[a-z]+=/]',
          message: 'No pongas onclick/oninput en el HTML generado: usa data-action y action() de ui.js.',
        },
        {
          selector: "AssignmentExpression[left.object.name='window']",
          message: 'No publiques funciones en window: registra una acción con action() de ui.js.',
        },
      ],
    },
  },
  {
    // La lógica pura no debe tocar el navegador: si alguien usa document o window aquí, ESLint lo marca
    files: ['src/js/logic/**/*.js'],
    languageOptions: { globals: { structuredClone: 'readonly' } },
    rules: { 'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'navigator', 'location', 'fetch'] },
  },
  {
    files: ['server/**/*.js', 'vite.config.js', 'eslint.config.js', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  {
    files: ['check.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  prettier,
];
