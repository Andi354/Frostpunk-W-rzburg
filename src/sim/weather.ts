// Outside temperature for the scenario. Day 1 = 1 December 1946.
// Base values per day (°C at noon); night is colder. The storm ("Der Weiße Tod") arrives on day 30.
export const SCENARIO_DAYS = 35;

const DAILY: number[] = [
  -18, -19, -20, -20, -22, -23, -22, -24, -32, -38, // 1-10: cold snap on 9-10
  -30, -27, -26, -28, -30, -31, -33, -40, -46, -38, // 11-20: second snap 18-19
  -34, -35, -36, -38, -40, -42, -45, -48, -55, -70, // 21-30: the storm builds
  -82, -90, -76, -58, -48, // 31-35: Der Weiße Tod, then the break
];

export const STORM_DAYS = [30, 31, 32, 33];

export function dayOf(time: number): number {
  return Math.floor(time / 24) + 1;
}

export function hourOf(time: number): number {
  return Math.floor(time % 24);
}

export function baseTemp(day: number): number {
  const d = Math.max(1, Math.min(DAILY.length, day));
  return DAILY[d - 1];
}

/** Temperature at a given time in hours, with a day/night swing and the noon peak. */
export function outsideTemp(time: number, offset = 0): number {
  const day = dayOf(time);
  const h = time % 24;
  const today = baseTemp(day) + offset;
  // interpolate toward tomorrow in the last hours so snaps do not jump
  const tomorrow = baseTemp(day + 1) + offset;
  const blend = h > 18 ? (h - 18) / 12 : 0;
  const base = today * (1 - blend) + tomorrow * blend;
  const swing = 4 * Math.cos(((h - 14) / 24) * Math.PI * 2); // warmest at 14:00
  return Math.round((base - 4 + swing) * 10) / 10;
}

export function isStorm(day: number): boolean {
  return STORM_DAYS.includes(day);
}

/** Snowfall intensity 0..1 for the renderer and expeditions. */
export function snowIntensity(time: number): number {
  const day = dayOf(time);
  if (isStorm(day)) return 1;
  const t = baseTemp(day);
  return Math.min(0.85, 0.2 + Math.max(0, -t - 18) / 40);
}

export interface ForecastDay {
  day: number;
  temp: number;
  storm: boolean;
}

/** Forecast for the next days. Further days are known only roughly (rounded to 5 °C). */
export function forecast(time: number, days: number, precise: number): ForecastDay[] {
  const out: ForecastDay[] = [];
  const today = dayOf(time);
  for (let d = today; d < today + days && d <= SCENARIO_DAYS; d++) {
    const t = baseTemp(d) - 4;
    out.push({ day: d, temp: d - today < precise ? t : Math.round(t / 5) * 5, storm: isStorm(d) });
  }
  return out;
}

export const MONTH_NAMES = ['Dezember', 'Januar'];

export function dateLabel(day: number): string {
  if (day <= 31) return `${day}. Dezember 1946`;
  return `${day - 31}. Januar 1947`;
}
