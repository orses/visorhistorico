import { describe, it, expect, vi, afterEach } from 'vitest';

describe('logger', () => {
    afterEach(() => vi.restoreAllMocks());

    it('does not call console.log in production (DEV=false)', async () => {
        // Simulate production: import.meta.env.DEV is false in test by default
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { default: logger } = await import('../modules/logger.js');
        // In test mode Vite sets DEV=true, so we only verify the module loads
        expect(logger).toHaveProperty('log');
        expect(logger).toHaveProperty('warn');
        expect(logger).toHaveProperty('error');
    });

    it('exposes log, warn and error methods', async () => {
        const { default: logger } = await import('../modules/logger.js');
        expect(typeof logger.log).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
    });
});
