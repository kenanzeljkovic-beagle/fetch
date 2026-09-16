import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { getStore, DISPOSITIONS, CallStatus, Disposition } from '../store';
import { isE164, toE164 } from '../lib/phone';
import { HttpError } from '../lib/errors';
import { getContact, logCallNote, MOCK_CONTACTS } from '../services/twenty';
import { addToDnc, checkCall } from '../services/guard';

export const callsRouter = Router();

const STATUSES: CallStatus[] = ['initiated', 'calling', 'connected', 'completed', 'no-answer', 'failed'];

/** Create a call record before dialing. Normalises the number; refuses to proceed if it can't. */
callsRouter.post('/api/calls', async (req, res, next) => {
  try {
    const { twentyContactId, contactName, phoneNumber, sessionId, repEmail } = req.body ?? {};
    // twentyContactId is optional — a manual dial (typed on the keypad) has no CRM contact behind it.
    if (twentyContactId != null && typeof twentyContactId !== 'string') throw new HttpError(400, 'twentyContactId must be a string.', 'BAD_REQUEST');
    if (!phoneNumber) throw new HttpError(400, 'Enter a phone number to call.', 'NO_PHONE');
    const e164 = toE164(phoneNumber);
    if (!e164 || !isE164(e164)) throw new HttpError(400, `"${phoneNumber}" is not a valid phone number, so the call was not placed.`, 'INVALID_PHONE');

    // Fetch Guard: re-read the contact from the source of truth (never trust the browser's copy).
    // Manual dials have no CRM record, so only the phone-based rules (internal DNC, calling hours) apply.
    const contact = !twentyContactId
      ? { doNotCall: false, companyType: null }
      : config.mockMode
      ? MOCK_CONTACTS.find((m) => m.id === twentyContactId) ?? { doNotCall: false, companyType: null }
      : await getContact(twentyContactId);
    const guard = await checkCall({ repEmail: repEmail ?? null, phoneNumber: e164, contact });

    const base = {
      id: randomUUID(),
      twentyContactId: twentyContactId || null,
      contactName: String(contactName || '').trim() || (twentyContactId ? '(no name)' : e164),
      phoneNumber: e164,
      telnyxCallId: null,
      disposition: null,
      notes: null,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      twentyNoteId: null,
      loggedAt: null,
      lastLogError: null,
      sessionId: sessionId ?? null,
      repEmail: repEmail ?? null,
    };

    if (!guard.allowed) {
      // Refused server-side. The attempt itself is stored — that is the audit trail.
      const blocked = await getStore().create({ ...base, status: 'blocked', blockedReasons: guard.reasons, endedAt: new Date().toISOString() });
      return res.status(403).json({ error: guard.detail.join(' '), code: 'BLOCKED', reasons: guard.reasons, detail: guard.detail, call: blocked });
    }

    const rec = await getStore().create({ ...base, status: 'initiated', blockedReasons: null });
    res.status(201).json({ call: rec, guard });
  } catch (e) { next(e); }
});

callsRouter.get('/api/calls', async (req, res, next) => {
  try {
    const unloggedOnly = req.query.unlogged === 'true';
    res.json({ calls: await getStore().list({ limit: 50, unloggedOnly }) });
  } catch (e) { next(e); }
});

callsRouter.get('/api/calls/:id', async (req, res, next) => {
  try {
    const call = await getStore().get(req.params.id);
    if (!call) throw new HttpError(404, 'Call not found.', 'CALL_NOT_FOUND');
    res.json({ call });
  } catch (e) { next(e); }
});

/** The browser reports lifecycle transitions here (calling -> connected -> completed / no-answer / failed). */
callsRouter.post('/api/calls/:id/status', async (req, res, next) => {
  try {
    const { status, telnyxCallId, startedAt, endedAt } = req.body ?? {};
    if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`, 'BAD_REQUEST');
    const store = getStore();
    const cur = await store.get(req.params.id);
    if (!cur) throw new HttpError(404, 'Call not found.', 'CALL_NOT_FOUND');

    const patch: Record<string, unknown> = { status };
    if (telnyxCallId) patch.telnyxCallId = String(telnyxCallId);
    if (startedAt) patch.startedAt = new Date(startedAt).toISOString();
    if (endedAt) patch.endedAt = new Date(endedAt).toISOString();
    const started = (patch.startedAt as string) ?? cur.startedAt;
    const ended = (patch.endedAt as string) ?? cur.endedAt;
    if (started && ended) patch.durationSeconds = Math.max(0, Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000));
    if (!started && ended) patch.durationSeconds = 0;

    res.json({ call: await store.update(cur.id, patch) });
  } catch (e) { next(e); }
});

/** Free-text notes, saved independently so they persist as the rep types, before disposition/logging. */
callsRouter.post('/api/calls/:id/notes', async (req, res, next) => {
  try {
    const store = getStore();
    const cur = await store.get(req.params.id);
    if (!cur) throw new HttpError(404, 'Call not found.', 'CALL_NOT_FOUND');
    if (cur.twentyNoteId) throw new HttpError(409, 'This call is already logged to Twenty; notes can no longer be changed.', 'ALREADY_LOGGED');
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 4000) : '';
    res.json({ call: await store.update(cur.id, { notes }) });
  } catch (e) { next(e); }
});

callsRouter.post('/api/calls/:id/disposition', async (req, res, next) => {
  try {
    const { disposition } = req.body ?? {};
    if (!DISPOSITIONS.includes(disposition)) throw new HttpError(400, `disposition must be one of ${DISPOSITIONS.join(', ')}`, 'BAD_REQUEST');
    const store = getStore();
    const cur = await store.get(req.params.id);
    if (!cur) throw new HttpError(404, 'Call not found.', 'CALL_NOT_FOUND');
    if (cur.twentyNoteId) throw new HttpError(409, 'This call is already logged to Twenty; its disposition can no longer be changed.', 'ALREADY_LOGGED');
    const call = await store.update(cur.id, { disposition: disposition as Disposition });
    // "Do Not Call" is a compliance event, not just a label: the number goes on the internal DNC list immediately.
    if (disposition === 'do_not_call') await addToDnc(cur.phoneNumber);
    res.json({ call, addedToDnc: disposition === 'do_not_call' });
  } catch (e) { next(e); }
});

/**
 * Write the call to Twenty as a Note on the ORIGINAL contact ID.
 * Idempotent: a second call returns the existing note instead of creating a duplicate.
 * On failure the record keeps everything needed to retry (and stores the error).
 */
callsRouter.post('/api/calls/:id/log', async (req, res, next) => {
  try {
    const store = getStore();
    const cur = await store.get(req.params.id);
    if (!cur) throw new HttpError(404, 'Call not found.', 'CALL_NOT_FOUND');
    if (cur.twentyNoteId) return res.json({ call: cur, alreadyLogged: true, message: 'Already logged to Twenty.' });
    if (['initiated', 'calling', 'connected'].includes(cur.status)) throw new HttpError(409, 'The call has not ended yet.', 'CALL_ACTIVE');
    if (!cur.disposition) throw new HttpError(400, 'Pick a disposition before logging the call.', 'NO_DISPOSITION');

    // Manual dial with no Twenty contact behind it — nothing to write to the CRM, so just
    // mark the call closed out locally. Still real work: it clears the Unlogged Calls list
    // and keeps the audit trail (disposition, notes, duration) in Fetch's own store.
    if (!cur.twentyContactId) {
      const call = await store.update(cur.id, { loggedAt: new Date().toISOString(), lastLogError: null });
      return res.json({ call, noContact: true, message: 'No Twenty contact linked — saved locally only.' });
    }

    if (config.mockMode) {
      const call = await store.update(cur.id, { twentyNoteId: `mock-note-${cur.id.slice(0, 8)}`, loggedAt: new Date().toISOString(), lastLogError: null });
      return res.json({ call, mock: true });
    }

    try {
      const noteId = await logCallNote({
        personId: cur.twentyContactId,
        contactName: cur.contactName,
        phoneNumber: cur.phoneNumber,
        durationSeconds: cur.durationSeconds ?? 0,
        disposition: cur.disposition,
        notes: cur.notes,
        telnyxCallId: cur.telnyxCallId,
        date: new Date(cur.endedAt ?? cur.createdAt),
      });
      const call = await store.update(cur.id, { twentyNoteId: noteId, loggedAt: new Date().toISOString(), lastLogError: null });
      res.json({ call });
    } catch (e: any) {
      await store.update(cur.id, { lastLogError: e.message });
      throw new HttpError(e.status && e.status !== 404 ? e.status : 502, `Call completed, but the activity could not be logged to Twenty. ${e.message}`, 'TWENTY_LOG_FAILED');
    }
  } catch (e) { next(e); }
});
