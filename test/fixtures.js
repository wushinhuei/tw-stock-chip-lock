export function bars(overrides = {}) {
  return Array.from({ length: 120 }, (_, index) => {
    const close = 50 + index * 0.2;
    return {
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
      open: close - 0.2, high: close + 0.5, low: close - 0.5, close,
      volumeLots: 1500, volumeShares: 1_500_000, tradeValue: 100_000_000,
      ...overrides
    };
  });
}

export function institutional(dateRows = bars().slice(-5)) {
  return dateRows.map(row => ({ date: row.date, symbol: '1234', foreignNet: 100_000, trustNet: 100_000 }));
}

export function margin(dateRows = bars().slice(-21), ratio = 0.3) {
  return dateRows.map((row, index) => ({
    date: row.date, symbol: '1234', marginBalance: 10_000 + index * 100,
    shortBalance: Math.round((10_000 + index * 100) * ratio)
  }));
}

export function stock(overrides = {}) {
  const stockBars = overrides.bars || bars();
  const monthlyRevenue = Array.from({ length: 36 }, (_, index) => {
    const date = new Date(Date.UTC(2023, 8 + index, 1));
    return { symbol: '1234', yearMonth: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, revenue: 1000 + index * 10, downloadedAt: '2026-09-04T00:00:00Z', availableAt: '2026-09-04T00:00:00Z' };
  });
  return {
    symbol: '1234', name: '測試股', market: 'TWSE', bars: stockBars,
    institutional: institutional(stockBars.slice(-5)), margin: margin(stockBars.slice(-21)),
    tdccWeeks: [
      { date: '2026-08-14', symbol: '1234', largeHolderRatio: 0.40, totalHolders: 10000 },
      { date: '2026-08-21', symbol: '1234', largeHolderRatio: 0.42, totalHolders: 9500 },
      { date: '2026-08-28', symbol: '1234', largeHolderRatio: 0.45, totalHolders: 9000 }
    ],
    monthlyRevenue,
    expectedDate: stockBars.at(-1).date,
    asOf: '2026-09-05T00:00:00Z',
    ...overrides,
    bars: stockBars
  };
}
