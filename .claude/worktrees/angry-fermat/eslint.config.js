export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.firebase/**',
            '**/public/lib/**',
            '**/*.min.js',
            '**/firebase-debug.log'
        ]
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                firebase: 'readonly',
                // Node globals (for functions)
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly'
            }
        },
        rules: {
            // Code Style
            'indent': ['error', 2],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always'],

            // Best Practices
            'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
            'no-console': 'off', // Allow console for Firebase Functions logging
            'no-debugger': 'warn',
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'warn',

            // Naming Conventions
            'camelcase': ['warn', { 'properties': 'never', 'ignoreDestructuring': true }],

            // Complexity
            'max-lines': ['warn', { 'max': 500, 'skipBlankLines': true, 'skipComments': true }],
            'max-lines-per-function': ['warn', { 'max': 100, 'skipBlankLines': true, 'skipComments': true }],
            'complexity': ['warn', 15],

            // Error Prevention
            'no-duplicate-imports': 'error',
            'no-undef': 'error',
            'no-redeclare': 'error',
            'eqeqeq': ['error', 'always']
        }
    },
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: await import('vue-eslint-parser'),
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module'
            }
        },
        rules: {
            // Vue-specific rules can be added here
        }
    }
];
