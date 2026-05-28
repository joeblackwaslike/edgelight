---
title: Project Structure
---

# Project Structure

```
edgelight/
├── src/
│   ├── index.ts          # public API exports
│   └── ...               # replace with your structure
├── docs/                 # documentation source
├── dist/                 # build output (gitignored)
└── package.json
```

## Module Boundaries

Describe the internal module structure and how modules relate.

## Public API

Everything exported from `src/index.ts` is part of the public API and subject to semver.
Everything else is internal and may change without notice.
