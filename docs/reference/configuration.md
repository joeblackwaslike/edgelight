---
title: Configuration Reference
---

# Configuration Reference

## Full Config Schema

```typescript
interface Config {
  // Replace with your actual Config interface
  required: string;
  optional?: boolean;
}
```

## Options

### `required`

**Type:** `string` · **Required:** yes

Description of this option.

### `optional`

**Type:** `boolean` · **Default:** `false`

Description of this option.

## Configuration Sources

List where configuration can come from (constructor args, env vars, config file, etc.).
