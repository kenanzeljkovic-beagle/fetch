import { Router } from 'express';
import { config, telnyxConfigured, twentyConfigured, validateConfig } from '../config';
import { storeKind } from '../store';

export const healthRouter = Router();

healthRouter.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: config.mockMode ? 'mock' : 'live',
    twenty: config.mockMode ? 'mock' : twentyConfigured() ? 'configured' : 'missing',
    telnyx: config.mockMode ? 'mock' : telnyxConfigured() ? 'configured' : 'missing',
    store: storeKind(),
    callerNumber: config.mockMode ? '+10000000000' : config.telnyx.phoneNumber || null,
    problems: validateConfig(),
  });
});
