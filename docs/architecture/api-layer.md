---
title: API Layer
---

# API Layer

## Overview

Describe the API layer of edgelight — how it exposes functionality to consumers.

## Public API Surface

Everything exported from `src/index.ts` is part of the public API and subject to semver.

```typescript
// Example: primary exports
export { yourMainExport } from './core.js';
export type { Config, Result } from './types.js';
```

## API Design Principles

- **Minimal surface** — only expose what consumers need; keep internals private
- **Type-safe** — every parameter and return type is fully typed; no `any`
- **Stable** — breaking changes require a major version bump

## Request / Response Flow

Describe how a call flows from consumer → public API → internal implementation → return value.

```
Consumer → yourMainExport(input)
         → validate(input)
         → process(validated)
         → Result
```

## Error Handling

Describe how errors surface to callers (thrown exceptions, returned error objects, Result types, etc.).

## Versioning

Describe your semver strategy and how you signal deprecations before breaking changes.
