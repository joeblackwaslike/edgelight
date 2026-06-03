---
title: Contributing (Dev)
---

# Contributing — Developer Notes

This covers technical details for contributors. See the [user-facing contributing guide](../contributing) for the PR workflow.

## Project Setup

```bash
git clone https://github.com/joeblackwaslike/edgelite.git
cd edgelite
pnpm install
pnpm build
pnpm test
```

## Code Conventions

- TypeScript strict mode — no `any`, no `@ts-ignore`
- Biome for formatting — `pnpm lint:fix` before committing
- Conventional commits — required for release-please automation

## Release Process

Releases are fully automated:
1. Commit with conventional commit messages
2. release-please opens a versioned PR automatically
3. Merge the PR → release created → npm published → docs deployed
