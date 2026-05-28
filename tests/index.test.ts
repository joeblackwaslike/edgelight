import { describe, expect, it } from 'vitest';
import { greet } from '@/index.js';

describe('greet', () => {
  it('returns greeting with name', () => {
    expect(greet('world')).toBe('Hello, world!');
  });
});
