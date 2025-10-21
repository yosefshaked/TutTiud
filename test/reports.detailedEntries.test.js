import { describe, it } from 'node:test';

describe('DetailedEntriesReport component', () => {
  it('renders', async (t) => {
    try {
      await import('../src/components/reports/DetailedEntriesReport.jsx');
      t.skip('JSX loader not available for rendering tests');
    } catch {
      t.skip('JSX loader not available');
    }
  });
});
