import { expect, spyOn, test } from 'bun:test';
import { api } from './api.js';
import { getStockPrices } from './stock-price.js';

test('widens a same-day query by seven calendar days in Asia/Shanghai', async () => {
  const timezone = process.env.TZ;
  const get = spyOn(api, 'get').mockResolvedValue({ data: { prices: [] }, url: 'https://example.com/prices' });
  try {
    process.env.TZ = 'Asia/Shanghai';
    await getStockPrices.invoke({ ticker: ' aapl ', start_date: '2026-01-10', end_date: '2026-01-10' });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ ticker: 'AAPL', start_date: '2026-01-03', end_date: '2026-01-10' });
  } finally {
    if (timezone === undefined) delete process.env.TZ;
    else process.env.TZ = timezone;
    get.mockRestore();
  }
});
