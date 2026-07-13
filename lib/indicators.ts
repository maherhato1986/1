export type Bar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export function sma(values: number[], period: number): number {
  if (!values.length) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] * multiplier + result[i - 1] * (1 - multiplier));
  }
  return result;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < 2) return 50;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  const sample = changes.slice(-Math.min(period, changes.length));
  const gains = sample.reduce((sum, change) => sum + Math.max(change, 0), 0) / sample.length;
  const losses = sample.reduce((sum, change) => sum + Math.max(-change, 0), 0) / sample.length;
  if (losses === 0) return gains > 0 ? 100 : 50;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function macdSignal(values: number[]): "bullish" | "bearish" | "neutral" {
  if (values.length < 10) return "neutral";
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const macd = values.map((_, index) => (fast[index] ?? fast.at(-1) ?? 0) - (slow[index] ?? slow.at(-1) ?? 0));
  const signal = emaSeries(macd, 9);
  const current = macd.at(-1) ?? 0;
  const previous = macd.at(-2) ?? current;
  const currentSignal = signal.at(-1) ?? 0;
  if (current > currentSignal && current >= previous) return "bullish";
  if (current < currentSignal && current <= previous) return "bearish";
  return "neutral";
}

export function trueRangeAverage(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const ranges = bars.slice(1).map((bar, index) => {
    const previousClose = bars[index].c;
    return Math.max(bar.h - bar.l, Math.abs(bar.h - previousClose), Math.abs(bar.l - previousClose));
  });
  return sma(ranges, period);
}
