import { Router } from 'express';
import { config, telnyxConfigured } from '../config';
import { createLoginToken } from '../services/telnyx';
import { HttpError } from '../lib/errors';

export const telnyxRouter = Router();

/**
 * Hands the browser a short-lived Telnyx JWT plus the caller number.
 * No secret ever leaves the server. In mock mode the browser simulates calls instead.
 */
telnyxRouter.post('/api/telnyx/token', async (_req, res, next) => {
  try {
    if (config.mockMode) return res.json({ mock: true, callerNumber: '+10000000000' });
    if (!telnyxConfigured()) throw new HttpError(503, 'Telnyx is not configured (TELNYX_API_KEY / TELNYX_CONNECTION_ID / TELNYX_PHONE_NUMBER).', 'TELNYX_NOT_CONFIGURED');
    const token = await createLoginToken();
    res.json({ token, callerNumber: config.telnyx.phoneNumber, expiresInSeconds: 24 * 3600 });
  } catch (e) { next(e); }
});
