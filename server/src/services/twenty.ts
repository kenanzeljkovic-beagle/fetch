/**
 * Twenty CRM integration.
 *
 * Auth:      Authorization: Bearer <API key>   (Twenty > Settings > API & Webhooks)
 * Contacts:  GET  {TWENTY_API_URL}/rest/people?limit=…&depth=1
 *            depth=1 expands the `company` relation so we get the company name.
 * Logging:   Twenty has no native "Call" activity object, so the closest reliable
 *            mechanism is a Note attached to the person:
 *              POST /rest/notes        { title, bodyV2: { markdown } }
 *              POST /rest/noteTargets  { noteId, targetPersonId }
 *            noteTarget is a polymorphic ("morph") relation on Twenty's side — targetPersonId,
 *            targetCompanyId, and targetOpportunityId all live on the same object, confirmed via
 *            GET /rest/metadata/objects?filter=nameSingular[eq]:noteTarget&depth=2.
 *            The noteTarget is what places the note on that exact person's timeline.
 *
 * Twenty's REST API is generated from each workspace's schema, so this module reads
 * defensively (phones/emails composites vs. older flat fields) and falls back from
 * `bodyV2` to `body` if a workspace is on an older version.
 */
import { config, twentyConfigured } from '../config';
import { HttpError } from '../lib/errors';
import { toE164 } from '../lib/phone';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  company: string | null;
  phoneRaw: string | null;   // what Twenty holds
  phone: string | null;      // E.164 or null if it can't be normalised
  email: string | null;
  doNotCall: boolean;        // Person.doNotCall (custom boolean field); false if the field doesn't exist
  companyType: string | null;// Company.companyType (custom field); null if absent
}

async function request<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!twentyConfigured()) throw new HttpError(503, 'Twenty is not configured (TWENTY_API_URL / TWENTY_API_KEY).', 'TWENTY_NOT_CONFIGURED');

  let res: Response;
  try {
    res = await fetch(`${config.twenty.url}/rest${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.twenty.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (e: any) {
    throw new HttpError(502, `Could not reach Twenty at ${config.twenty.url}: ${e.message}`, 'TWENTY_UNREACHABLE');
  }

  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (res.status === 401 || res.status === 403) {
    throw new HttpError(401, 'Twenty rejected the API key. Check TWENTY_API_KEY.', 'TWENTY_AUTH');
  }
  if (!res.ok) {
    const detail = json?.messages?.join?.('; ') || json?.message || json?.error || text.slice(0, 300);
    throw new HttpError(502, `Twenty ${init.method ?? 'GET'} ${path} failed (${res.status}): ${detail}`, 'TWENTY_API');
  }
  return json as T;
}

/** Twenty wraps responses as { data: { people: [...] } } / { data: { person: {...} } }. */
function unwrap(json: any): any {
  const data = json?.data ?? json;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length === 1) return data[keys[0]];
  }
  return data;
}

function rawPhone(p: any): string | null {
  const ph = p?.phones;
  if (ph?.primaryPhoneNumber) {
    const cc = ph.primaryPhoneCallingCode || (ph.primaryPhoneCountryCode ? '' : '');
    const num = String(ph.primaryPhoneNumber);
    return num.startsWith('+') ? num : `${cc || ''}${num}`;
  }
  return p?.phone ?? null;
}

export function normalisePerson(p: any): Contact {
  const firstName = p?.name?.firstName ?? '';
  const lastName = p?.name?.lastName ?? '';
  const raw = rawPhone(p);
  return {
    id: p.id,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim() || '(no name)',
    company: p?.company?.name ?? null,
    phoneRaw: raw,
    phone: toE164(raw),
    email: p?.emails?.primaryEmail ?? p?.email ?? null,
    // Twenty's REST API returns custom fields by their internal `name`, not their display
    // `label` — confirmed via GET /rest/metadata/objects: the Person field labeled "doNotCall"
    // is actually keyed "donotcall", and Company's "companyType" is keyed "companytype".
    doNotCall: Boolean(p?.donotcall ?? p?.doNotCall),
    companyType: p?.company?.companytype ?? p?.company?.companyType ?? p?.company?.type ?? null,
  };
}

export async function listContacts(limit = 50): Promise<Contact[]> {
  const json = await request(`/people?limit=${limit}&depth=1`);
  const people = unwrap(json);
  return (Array.isArray(people) ? people : []).map(normalisePerson);
}

export async function getContact(id: string): Promise<Contact> {
  const json = await request(`/people/${encodeURIComponent(id)}?depth=1`);
  const person = unwrap(json);
  if (!person?.id) throw new HttpError(404, 'Contact not found in Twenty.', 'CONTACT_NOT_FOUND');
  return normalisePerson(person);
}

export interface CallNoteInput {
  personId: string;
  contactName: string;
  phoneNumber: string;
  durationSeconds: number;
  disposition: string;
  notes: string | null;
  telnyxCallId: string | null;
  date: Date;
}

const DISPOSITION_LABEL: Record<string, string> = {
  connected: 'Connected', no_answer: 'No Answer', voicemail: 'Voicemail', busy: 'Busy', wrong_number: 'Wrong Number', do_not_call: 'Do Not Call', other: 'Other',
};

export function buildNoteBody(i: CallNoteInput) {
  const m = Math.floor(i.durationSeconds / 60), s = i.durationSeconds % 60;
  const date = i.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const title = `Outbound call via Fetch — ${DISPOSITION_LABEL[i.disposition] ?? i.disposition}`;
  const lines = [
    '**Outbound call via Fetch**', '',
    `Contact: ${i.contactName}`,
    `Phone: ${i.phoneNumber}`,
    `Duration: ${m}m ${s}s`,
    `Disposition: ${DISPOSITION_LABEL[i.disposition] ?? i.disposition}`,
  ];
  if (i.notes && i.notes.trim()) lines.push('', '**Notes**', i.notes.trim());
  lines.push('', `Telnyx Call ID: ${i.telnyxCallId ?? 'n/a'}`, `Date: ${date}`);
  const markdown = lines.join('\n');
  return { title, markdown };
}

/** Creates the note and attaches it to the exact person ID. Returns the note ID. */
export async function logCallNote(i: CallNoteInput): Promise<string> {
  const { title, markdown } = buildNoteBody(i);

  let note: any;
  try {
    note = unwrap(await request('/notes', { method: 'POST', body: { title, bodyV2: { markdown } } }));
  } catch (e: any) {
    // Older workspaces expose `body` instead of `bodyV2`.
    if (e instanceof HttpError && /bodyV2/i.test(e.message)) {
      note = unwrap(await request('/notes', { method: 'POST', body: { title, body: markdown } }));
    } else {
      throw e;
    }
  }
  if (!note?.id) throw new HttpError(502, 'Twenty created the note but returned no ID.', 'TWENTY_API');

  await request('/noteTargets', { method: 'POST', body: { noteId: note.id, targetPersonId: i.personId } });
  return note.id;
}

// ---------------------------------------------------------------------------
// MOCK MODE — clearly isolated. Only used when MOCK_MODE=true.
// ---------------------------------------------------------------------------
export const MOCK_CONTACTS: Contact[] = [
  { id: 'mock-1', firstName: 'John', lastName: 'Smith', name: 'John Smith', company: 'ABC Property Management', phoneRaw: '(813) 555-1234', phone: '+18135551234', email: 'john@example.com', doNotCall: false, companyType: 'Property Management' },
  { id: 'mock-2', firstName: 'Maria', lastName: 'Lopez', name: 'Maria Lopez', company: 'Bayview Apartments', phoneRaw: '727-555-0199', phone: '+17275550199', email: 'maria@example.com', doNotCall: false, companyType: 'Property Management' },
  { id: 'mock-3', firstName: 'No', lastName: 'Phone', name: 'No Phone', company: 'Example Co', phoneRaw: null, phone: null, email: 'nophone@example.com', doNotCall: false, companyType: null },
  { id: 'mock-4', firstName: 'Bad', lastName: 'Number', name: 'Bad Number', company: 'Example Co', phoneRaw: '12345', phone: null, email: null, doNotCall: false, companyType: null },
  { id: 'mock-5', firstName: 'Dana', lastName: 'DNC', name: 'Dana DNC', company: 'Opted Out LLC', phoneRaw: '(813) 555-0100', phone: '+18135550100', email: 'dana@example.com', doNotCall: true, companyType: 'Property Management' },
  { id: 'mock-6', firstName: 'Carl', lastName: 'Carrier', name: 'Carl Carrier', company: 'Rival Insurance', phoneRaw: '(212) 555-0177', phone: '+12125550177', email: 'carl@example.com', doNotCall: false, companyType: 'Insurance Carrier' },
];
