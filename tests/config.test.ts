import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('configuration', () => {
  it('loads safe local defaults', () => {
    expect(loadConfig({})).toMatchObject({ PORT: 8080, ROLE: 'all', OUTBOX_POLL_MS: 500 });
  });

  it('parses numeric environment variables', () => {
    expect(loadConfig({ PORT: '9090', OUTBOX_POLL_MS: '750' })).toMatchObject({
      PORT: 9090,
      OUTBOX_POLL_MS: 750,
    });
  });

  it('rejects an invalid role', () => {
    expect(() => loadConfig({ ROLE: 'root' })).toThrow();
  });
});
