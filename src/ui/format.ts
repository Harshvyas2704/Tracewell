// Virtual times are on a 0.001 ms grid. Trailing zeros are dropped.
export function formatMs(ms: number): string {
  return `${Number(ms.toFixed(3))} ms`;
}

// Always three decimals, for columns of times that should line up.
export function formatMsFixed(ms: number): string {
  return `${ms.toFixed(3)} ms`;
}

export function formatJson(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value, null, 2);
}
