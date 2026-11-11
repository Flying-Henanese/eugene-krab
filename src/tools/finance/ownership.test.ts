import { describe, expect, spyOn, test } from 'bun:test';
import { api } from './api.js';
import { getBeneficialOwnership } from './beneficial_ownership.js';
import { getInsiderOwnership } from './insider_ownership.js';
import { createGetInsiderTrades } from './insider_trades.js';

describe('ownership tools', () => {
  test('resolves an owner name to a padded CIK and preserves stake filters', async () => {
    const get = spyOn(api, 'get');
    try {
      get.mockResolvedValueOnce({ data: { filers: [{ filer_cik: '123', name: 'Example Capital' }] }, url: 'https://example.com/filers' });
      get.mockResolvedValueOnce({ data: { beneficial_owners: [{ percent_of_class: 7 }] }, url: 'https://example.com/stakes' });

      const result = JSON.parse(await getBeneficialOwnership.invoke({ filer_name: 'Example', type: 'activist', history: true }));

      expect(get.mock.calls[1]?.[1]).toMatchObject({ filer_cik: '0000000123', type: 'activist', history: 'true' });
      expect(result.data).toEqual([{ percent_of_class: 7 }]);
      expect(result.sourceUrls).toEqual(['https://example.com/stakes']);
    } finally {
      get.mockRestore();
    }
  });

  test('rejects ambiguous query modes before making an API request', async () => {
    const get = spyOn(api, 'get');
    try {
      await expect(getBeneficialOwnership.invoke({ ticker: 'AAPL', filer_name: 'Example' })).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
    }
  });

  test('returns insider holdings with source URLs and removes redundant issuer payloads', async () => {
    const get = spyOn(api, 'get').mockResolvedValue({
      data: { insider_ownership: [{ shares: 100, issuer: { name: 'Example' } }] },
      url: 'https://example.com/holdings',
    });
    try {
      const result = JSON.parse(await getInsiderOwnership.invoke({ ticker: 'aapl', form_type: '3' }));
      expect(get.mock.calls[0]?.[1]).toMatchObject({ ticker: 'AAPL', form_type: '3' });
      expect(result.data).toEqual([{ shares: 100 }]);
      expect(result.sourceUrls).toEqual(['https://example.com/holdings']);
    } finally {
      get.mockRestore();
    }
  });

  test('matches common insider names across SEC spellings and combines trades in date order', async () => {
    const get = spyOn(api, 'get');
    try {
      get.mockResolvedValueOnce({ data: { names: ['HUANG JEN HSUN', 'Jen Hsun Huang', 'OTHER PERSON'] }, url: 'https://example.com/names' });
      get.mockResolvedValueOnce({ data: { insider_trades: [{ filing_date: '2026-01-01', issuer: {} }] }, url: 'https://example.com/trades/1' });
      get.mockResolvedValueOnce({ data: { insider_trades: [{ filing_date: '2026-02-01', issuer: {} }] }, url: 'https://example.com/trades/2' });

      const result = JSON.parse(await createGetInsiderTrades('gpt-5.5').invoke({ ticker: 'nvda', name: 'Jensen Huang' }));

      expect(get.mock.calls.slice(1).map(call => call[1].name)).toEqual(['HUANG JEN HSUN', 'Jen Hsun Huang']);
      expect(result.data).toEqual([{ filing_date: '2026-02-01' }, { filing_date: '2026-01-01' }]);
      expect(result.sourceUrls).toHaveLength(2);
    } finally {
      get.mockRestore();
    }
  });
});
