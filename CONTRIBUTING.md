# Contributing to local-chat

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/DongGunYoon/local-chat.git
cd local-chat
npm install
npm run build
```

Run locally:

```bash
node dist/index.js
```

Run tests:

```bash
npm test           # Run tests
npm run test:watch # Watch mode
```

Watch mode for development:

```bash
npm run dev
```

## Branch Rules

- The `main` branch is protected — direct pushes are not allowed
- All changes must go through a pull request
- PRs require at least 1 approval before merging

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `npm run lint` passes with no errors
4. Ensure `npm run build` passes with no errors
5. Ensure `npm test` passes
6. Test manually — run the app and verify your changes work
7. Open a pull request

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
npm run lint      # Check for issues
npm run lint:fix  # Auto-fix issues
```

Most editors have a [Biome extension](https://biomejs.dev/guides/editors/first-party-extensions/) for real-time feedback.

- TypeScript strict mode
- Functional React components with Ink
- Keep dependencies minimal

## Reporting Issues

Open an issue at https://github.com/DongGunYoon/local-chat/issues with:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
