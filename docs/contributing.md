---
title: Contributing
---

# Contributing

Thank you for your interest in contributing to edgelight!

## Development Setup

```bash
git clone https://github.com/joeblackwaslike/edgelight.git
cd edgelight
pnpm install
```

## Running Tests

```bash
pnpm test          # run tests
pnpm test:coverage # run with coverage
```

## Code Quality

```bash
pnpm check         # typecheck + lint
pnpm lint:fix      # auto-fix linting issues
```

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests
4. Ensure all checks pass: `pnpm check && pnpm test`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add new feature`
   - `fix: correct a bug`
   - `docs: update documentation`
6. Open a pull request

## Release Process

Releases are automated via [release-please](https://github.com/googleapis/release-please).
Merging a release PR automatically publishes to npm and deploys the docs.
