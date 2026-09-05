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
  return {
    symbol: '1234', name: '測試股', market: 'TWSE', bars: stockBars,
    institutional: institutional(stockBars.slice(-5)), margin: margin(stockBars.slice(-21)),
    tdccWeeks: [
      { date: '2026-08-14', symbol: '1234', largeHolderRatio: 0.40, totalHolders: 10000 },
      { date: '2026-08-21', symbol: '1234', largeHolderRatio: 0.42, totalHolders: 9500 },
      { date: '2026-08-28', symbol: '1234', largeHolderRatio: 0.45, totalHolders: 9000 }
    ],
    ...overrides,
    bars: stockBars
  };
}
