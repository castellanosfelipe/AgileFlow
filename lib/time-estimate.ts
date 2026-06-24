const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = DAYS_PER_WEEK * MINUTES_PER_DAY;

const estimatePartPattern = /(\d+)\s*([wdhm])/gi;
const allowedEstimatePattern = /^(\s*\d+\s*[wdhm]\s*)+$/i;

export function formatJiraEstimate(minutes?: number | null) {
  if (!minutes || minutes <= 0) return "";

  const parts: string[] = [];
  let remaining = minutes;

  const weeks = Math.floor(remaining / MINUTES_PER_WEEK);
  if (weeks) {
    parts.push(`${weeks}w`);
    remaining -= weeks * MINUTES_PER_WEEK;
  }

  const days = Math.floor(remaining / MINUTES_PER_DAY);
  if (days) {
    parts.push(`${days}d`);
    remaining -= days * MINUTES_PER_DAY;
  }

  const hours = Math.floor(remaining / MINUTES_PER_HOUR);
  if (hours) {
    parts.push(`${hours}h`);
    remaining -= hours * MINUTES_PER_HOUR;
  }

  if (remaining) {
    parts.push(`${remaining}m`);
  }

  return parts.join(" ");
}

export function parseJiraEstimate(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!allowedEstimatePattern.test(normalized)) return Number.NaN;

  let totalMinutes = 0;
  estimatePartPattern.lastIndex = 0;

  for (const match of normalized.matchAll(estimatePartPattern)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (!Number.isSafeInteger(amount) || amount < 0) return Number.NaN;

    if (unit === "w") totalMinutes += amount * MINUTES_PER_WEEK;
    if (unit === "d") totalMinutes += amount * MINUTES_PER_DAY;
    if (unit === "h") totalMinutes += amount * MINUTES_PER_HOUR;
    if (unit === "m") totalMinutes += amount;
  }

  return totalMinutes;
}
