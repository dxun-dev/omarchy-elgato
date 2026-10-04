export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const plainText = (value: string) => value.replaceAll('<', '‹').replaceAll('>', '›');
