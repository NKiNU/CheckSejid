import { formatMYR, parseAmountToSen, sumSen } from './money';

describe('money (FIN-001)', () => {
  it('parses amounts into integer sen', () => {
    expect(parseAmountToSen('1,850.50')).toBe(185050);
    expect(parseAmountToSen('RM 12')).toBe(1200);
    expect(parseAmountToSen('0.1')).toBe(10);
    expect(parseAmountToSen('0.10')).toBe(10);
  });
  it('rejects invalid, zero, negative and over-precise amounts', () => {
    for (const bad of ['', 'abc', '-5', '0', '1.234', '1e3']) expect(parseAmountToSen(bad)).toBeNull();
  });
  it('avoids floating point drift when summing', () => {
    expect(sumSen([10, 20])).toBe(30);
    expect(formatMYR(sumSen([10, 20]))).toBe('RM 0.30');
  });
  it('formats MYR with two decimals', () => {
    expect(formatMYR(185000)).toBe('RM 1,850.00');
    expect(() => formatMYR(1.5)).toThrow();
  });
});
