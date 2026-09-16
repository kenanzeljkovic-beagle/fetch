import { Router } from 'express';
import { addToDnc, checkCall, getRules, saveRules, GuardRules } from '../services/guard';
import { HttpError } from '../lib/errors';
import { isE164, toE164 } from '../lib/phone';

export const guardRouter = Router();

/** Current rules (DNC list, per-rep permissions, calling hours). No auth in the prototype — see README. */
guardRouter.get('/api/guard/rules', async (_req, res, next) => {
  try { res.json({ rules: await getRules() }); } catch (e) { next(e); }
});

/** Replace any subset of the rules. Body is a partial GuardRules. */
guardRouter.put('/api/guard/rules', async (req, res, next) => {
  try {
    const patch = (req.body ?? {}) as Partial<GuardRules>;
    if (patch.dncList) {
      patch.dncList = patch.dncList.map((n) => toE164(n)).filter((n): n is string => Boolean(n && isE164(n)));
    }
    if (patch.repPermissions) {
      patch.repPermissions = Object.fromEntries(Object.entries(patch.repPermissions).map(([k, v]) => [k.toLowerCase(), v]));
    }
    res.json({ rules: await saveRules(patch) });
  } catch (e) { next(e); }
});

/** Add one number to the internal DNC list. */
guardRouter.post('/api/guard/dnc', async (req, res, next) => {
  try {
    const e164 = toE164(req.body?.phoneNumber);
    if (!e164) throw new HttpError(400, 'phoneNumber must be a valid phone number.', 'INVALID_PHONE');
    res.json({ rules: await addToDnc(e164) });
  } catch (e) { next(e); }
});

/** Ad-hoc check, e.g. from a future Watchdog bridge: { repEmail, phoneNumber, doNotCall?, companyType? } */
guardRouter.post('/api/guard/check', async (req, res, next) => {
  try {
    const { repEmail, phoneNumber, doNotCall, companyType } = req.body ?? {};
    const e164 = phoneNumber ? toE164(phoneNumber) : null;
    res.json(await checkCall({ repEmail: repEmail ?? null, phoneNumber: e164, contact: { doNotCall, companyType } }));
  } catch (e) { next(e); }
});
