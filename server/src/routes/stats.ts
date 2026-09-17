import { Router } from 'express';
import { getStore } from '../store';

export const statsRouter = Router();

/** Calendar day used for "today". The team works Eastern; the server runs in UTC. */
const STATS_TIME_ZONE = 'America/New_York';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(d);

/**
 * Header stats for the embedded dialer: { callsToday, connects, talkSeconds }.
 * Computed from the calls store. Blocked attempts are not dials, so they don't count.
 * ?rep=<email> narrows to one rep; without it, every rep's calls count.
 */
statsRouter.get('/api/stats/today', async (req, res, next) => {
  try {
    const rep = String(req.query.rep ?? '').trim().toLowerCase();
    const today = dayKey(new Date());
    const calls = (await getStore().list({ limit: 1000 })).filter(
      (c) => c.status !== 'blocked' && dayKey(new Date(c.createdAt)) === today && (!rep || (c.repEmail ?? '').toLowerCase() === rep),
    );
    const connected = calls.filter((c) => c.startedAt);
    res.json({
      callsToday: calls.length,
      connects: connected.length,
      talkSeconds: connected.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0),
    });
  } catch (e) { next(e); }
});
