---
title: Testing
---

# Testing

## Test Structure

```
src/
└── __tests__/
    ├── unit/
    └── integration/
```

## Running Tests

```bash
pnpm test               # all tests
pnpm test:coverage      # with coverage report
pnpm test -- --watch    # watch mode
```

## Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../src/index.js';

describe('yourFunction', () => {
  it('should do X when given Y', () => {
    const result = yourFunction(input);
    expect(result).toEqual(expected);
  });
});
```

## Testing Philosophy

Replace with your project's specific testing approach and conventions.
