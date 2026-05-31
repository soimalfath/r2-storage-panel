# Contributing to R2 Storage Panel

Thanks for your interest in contributing. This guide explains how to propose
changes.

## Getting Started

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and fill in your own R2 credentials:
   ```bash
   cp .env.example .env
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Branching

- Create a branch from the default branch for your work.
- Use descriptive prefixes: `feature/`, `fix/`, `refactor/`, `chore/`, `docs/`.
- Keep each branch focused on a single change.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add multi-bucket selector
fix: prevent API key leak on /api/apikey
docs: clarify deployment steps
```

Keep commits atomic and write messages in English.

## Pull Requests

- Target the default branch.
- Describe what changed and why. Link related issues with `Closes #<number>`.
- Make sure the app starts cleanly (`npm start`) and that you have manually
  tested the affected flows.
- Do not include unrelated formatting churn.
- Never commit secrets, `.env` files, or credentials.

## Code Style

- Keep functions small and single-purpose.
- Validate all client input on the server.
- Use parameterized/SDK calls — never build queries or commands by string
  concatenation.
- Prefer clear names over comments; comment only non-obvious decisions.

## Reporting Bugs and Requesting Features

Use the issue templates under **New issue**. For security vulnerabilities, do
not open a public issue — follow [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
