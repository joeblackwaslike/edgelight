---
title: Quality Checks
---

# Quality Checks

## On Every Commit (pre-commit hook)

- Biome format + lint
- ESLint strict mode

## On Every Push / PR (CI)

- `pnpm typecheck` — TypeScript strict mode, zero errors allowed
- `pnpm lint` — Biome CI + ESLint with `--max-warnings=0`
- `pnpm test:coverage` — Vitest with v8 coverage
- `pnpm depcheck` — no unused dependencies
- `pnpm docs:build` — Docusaurus + TypeDoc build (docs branch only)
- Dependency Review — blocks PRs with known-vulnerable dependencies (CVE severity: moderate+)

## Gates

| Gate | Threshold |
|------|-----------|
| Test coverage | Replace with your target (e.g., 80%) |
| TypeScript errors | 0 |
| ESLint warnings | 0 |
| Dependency vulnerabilities | 0 moderate+ |
