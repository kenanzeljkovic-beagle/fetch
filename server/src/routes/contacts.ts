import { Router } from 'express';
import { config } from '../config';
import { getContact, listContacts, MOCK_CONTACTS } from '../services/twenty';
import { HttpError } from '../lib/errors';
import { checkCall } from '../services/guard';

export const contactsRouter = Router();

/** Contacts + a Guard pre-check for the given rep so restrictions are visible before anyone clicks Call. */
contactsRouter.get('/api/contacts', async (req, res, next) => {
  try {
    const contacts = config.mockMode ? MOCK_CONTACTS : await listContacts(50);
    const repEmail = (req.query.rep as string) || null;
    const withGuard = await Promise.all(contacts.map(async (c) => ({
      ...c,
      guard: await checkCall({ repEmail, phoneNumber: c.phone, contact: c }),
    })));
    res.json({ contacts: withGuard, source: config.mockMode ? 'mock' : 'twenty' });
  } catch (e) { next(e); }
});

contactsRouter.get('/api/contacts/:id', async (req, res, next) => {
  try {
    if (config.mockMode) {
      const c = MOCK_CONTACTS.find((m) => m.id === req.params.id);
      if (!c) throw new HttpError(404, 'Contact not found.', 'CONTACT_NOT_FOUND');
      return res.json({ contact: c });
    }
    res.json({ contact: await getContact(req.params.id) });
  } catch (e) { next(e); }
});
