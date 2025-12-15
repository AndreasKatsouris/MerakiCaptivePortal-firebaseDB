# Code Quality Tools Setup

This document explains the code quality tools configured for this project.

## Tools Installed

### ESLint
JavaScript linter that identifies and reports on patterns in code.

### Prettier
Opinionated code formatter that ensures consistent code style.

### Husky (Optional)
Git hooks to run linting before commits.

### lint-staged (Optional)
Run linters on staged git files only.

## Configuration Files

- `eslint.config.js` - ESLint configuration
- `.prettierrc.json` - Prettier configuration
- `.prettierignore` - Files to exclude from Prettier

## Available Scripts

### Linting

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix
```

### Formatting

```bash
# Format all files
npm run format

# Check if files are formatted (without changing)
npm run format:check
```

## Usage

### During Development

1. **Before committing**:
   ```bash
   npm run lint:fix
   npm run format
   ```

2. **IDE Integration** (Recommended):
   - Install ESLint extension for VS Code
   - Install Prettier extension for VS Code
   - Enable "Format on Save" in VS Code settings

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "vue"
  ]
}
```

## Rules Enforced

Based on [Coding Standards](coding-standards.md):

### File Style
- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Line Length**: Max 100 characters

### Code Quality
- No `var`, use `const` or `let`
- Prefer arrow functions
- Max 500 lines per file
- Max 100 lines per function
- Complexity limit: 15

### Naming
- Variables/Functions: camelCase
- Classes: PascalCase (checked via warning)

## Optional: Pre-commit Hooks

To automatically lint and format before each commit:

### Setup Husky

```bash
# Initialize husky
npx husky init

# Add pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"
```

### Configure lint-staged

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.js": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.vue": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{css,md,json}": [
      "prettier --write"
    ]
  }
}
```

## Gradual Adoption

Since the codebase is large, you can:

1. **Fix files as you edit them** - Don't run format on entire codebase at once
2. **Use `.eslintignore`** - Temporarily ignore problematic files
3. **Warnings vs Errors** - Some rules are warnings to be addressed gradually

## Common Issues

### ESLint Errors in Existing Code

Many existing files may have linting errors. Fix them gradually:

```bash
# Lint specific files only
npx eslint public/js/queue-management.js --fix

# Lint a directory
npx eslint public/js/modules/queue-management/ --fix
```

### Prettier Conflicts

If Prettier and ESLint conflict:
- Prettier always wins for formatting
- ESLint handles code quality rules

## Next Steps

1. ✅ Tools installed and configured
2. ⏭️ Setup IDE extensions
3. ⏭️ (Optional) Configure pre-commit hooks
4. ⏭️ Gradually fix linting errors in existing files

---

**Last Updated**: 2025-12-15
