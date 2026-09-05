export async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const attempts = options.attempts || 3;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'tw-stock-chip-lock/0.1' },
        signal: AbortSignal.timeout(options.timeoutMs || 30000)
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = error.status === 403 || error.status === 429 ? (options.rateLimitWaitMs || 65000) : attempt * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export function compactDate(date) {
  return String(date).replaceAll('-', '');
}

export function parseNumber(value) {
  const text = String(value ?? '').replaceAll(',', '').replaceAll('%', '').trim();
  if (!text || text === '-' || text === '--') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function tradingWeekdays(endDate, calendarDays) {
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates = [];
  for (let offset = calendarDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - offset);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}
