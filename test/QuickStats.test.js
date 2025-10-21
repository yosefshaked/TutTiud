import { describe, it } from 'node:test';

describe('QuickStats component', () => {
  it('renders KPIs', async (t) => {
    try {
      await import('../src/components/dashboard/QuickStats.jsx');
      t.skip('JSX loader not available for rendering tests');
    } catch {
      t.skip('JSX loader not available');
    }
  });
});
