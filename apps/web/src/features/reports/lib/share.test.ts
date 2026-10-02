import { describe, expect, it } from 'vitest';
import { sharePct } from './share';

describe('sharePct', () => {
  it('rounds half up to one decimal', () => {
    expect(sharePct(2145)).toBe('21.5');
    expect(sharePct(2144)).toBe('21.4');
    expect(sharePct(1005)).toBe('10.1');
    expect(sharePct(10_000)).toBe('100.0');
    expect(sharePct(0)).toBe('0.0');
  });
});
