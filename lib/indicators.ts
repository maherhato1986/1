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
  const seedLength = Math.min(period, values.length);
  const seed = values.slice(0, seedLength).reduce((sum, value) => sum + value, 0) / seedLength;
  const result = new Array<number>(values.length).fill(seed);
  for (let i = seedLength; i < values.length; i += 1) {
    result[i] = values[i] * multiplier + result[i - 1] * (1 - multiplier);
  }
  return result;
}

/** Wilder RSI, matching the method used by most charting platforms. */
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let averageGain = changes.slice(0, period).reduce((sum, change) => sum + Math.max(change, 0), 0) / period;
  let averageLoss = changes.slice(0, period).reduce((sum, change) => sum + Math.max(-change, 0), 0) / period;

  for (let i = period; i < changes.length; i += 1) {
    averageGain = (averageGain * (period - 1) + Math.max(changes[i], 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
  }

  if (averageLoss === 0) return averageGain > 0 ? 100 : 50;
  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

export function macdSignal(values: number[]): "bullish" | "bearish" | "neutral" {
  if (values.length < 35) return "neutral";
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const macd = values.map((_, index) => fast[index] - slow[index]);
  const signal = emaSeries(macd, 9);
  const current = macd.at(-1) ?? 0;
  const previous = macd.at(-2) ?? current;
  const currentSignal = signal.at(-1) ?? 0;
  const previousSignal = signal.at(-2) ?? currentSignal;
  const histogram = current - currentSignal;
  const previousHistogram = previous - previousSignal;

  if (current > currentSignal && histogram >= previousHistogram) return "bullish";
  if (current < currentSignal && histogram <= previousHistogram) return "bearish";
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

export function completedBars(bars: Bar[], intervalMinutes = 5, now = Date.now()): Bar[] {
  if (!bars.length) return bars;
  const intervalMs = intervalMinutes * 60_000;
  return bars.filter((bar) => new Date(bar.t).getTime() + intervalMs <= now);
}
