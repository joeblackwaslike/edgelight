---
title: Hooks Reference
---

# Hooks Reference

Remove this page if edgelight does not have a hooks/plugin system.

## Available Hooks

| Hook | When it fires | Arguments |
|------|--------------|-----------|
| `onInit` | Replace with real hook | `(config: Config) => void` |

## Example

```typescript
import { createInstance } from 'edgelight';

const instance = createInstance({
  hooks: {
    onInit: (config) => {
      console.log('Initialized', config);
    },
  },
});
```
