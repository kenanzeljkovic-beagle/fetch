/**
 * Fetch Guard — the compliance engine, evaluated server-side before every dial.
 *
 * A call is allowed only if EVERY rule permits it (same layering principle as Watchdog).
 * Rules live in Fetch's own settings store; contact data comes from Twenty:
 *   - Person.doNotCall     (custom BOOLEAN field on Person)   → DNC_CRM
 *   - Company.companyType  (custom TEXT/SELECT field on Company) → COMPANY_TYPE permissions
 *
 * Reason codes are stable strings so the UI, the audit log, and (later) a Watchdog
 * bridge can all speak the same language.
 */
import { getStore } from '../store';

export type GuardReason = 'DNC_INTERNAL' | 'DNC_CRM' | 'COMPANY_TYPE' | 'CALLING_HOURS' | 'REP_UNKNOWN';

export interface GuardRules {
  /** Internal do-not-call list, E.164. Written to by the "Do Not Call" disposition. */
  dncList: string[];
  /** Per-rep Company Type permissions. 'ALL' or an explicit list. Reps not listed fall back to `defaultCompanyTypes`. */
  repPermissions: Record<string, { companyTypes: 'ALL' | string[] }>;
  /** Applied to reps with no entry in repPermissions. Default: everything allowed. */
  defaultCompanyTypes: 'ALL' | string[];
  /** Local time window in which calls may be placed (federal TSR default 8:00–21:00). */
  callingHours: { startHour: number; endHour: number; enabled: boolean };
  /** Whether Twenty's Person.doNotCall flag is enforced. */
  enforceCrmDnc: boolean;
}

export const DEFAULT_RULES: GuardRules = {
  dncList: [],
  repPermissions: {},
  defaultCompanyTypes: 'ALL',
  callingHours: { startHour: 8, endHour: 21, enabled: true },
  enforceCrmDnc: true,
};

const SETTING_KEY = 'guard.rules';

export async function getRules(): Promise<GuardRules> {
  const saved = await getStore().getSetting<Partial<GuardRules>>(SETTING_KEY);
  return { ...DEFAULT_RULES, ...(saved ?? {}), callingHours: { ...DEFAULT_RULES.callingHours, ...(saved?.callingHours ?? {}) } };
}

export async function saveRules(patch: Partial<GuardRules>): Promise<GuardRules> {
  const next = { ...(await getRules()), ...patch };
  next.dncList = [...new Set(next.dncList)];
  await getStore().setSetting(SETTING_KEY, next);
  return next;
}

export async function addToDnc(e164: string): Promise<GuardRules> {
  const rules = await getRules();
  if (!rules.dncList.includes(e164)) rules.dncList.push(e164);
  return saveRules({ dncList: rules.dncList });
}

// ---- calling hours: timezone from US area code -----------------------------------
// Coverage is deliberately partial (major metros). Unknown area codes fall back to
// Eastern, the most conservative choice for a Florida-based team. Extend as needed.
const TZ_BY_AREA: Record<string, string[]> = {
  'America/New_York': ['212','646','917','718','347','929','516','631','914','201','973','908','732','609','215','267','484','610','412','716','585','315','617','857','508','781','339','401','203','860','802','207','603','302','410','443','301','240','202','703','571','804','757','919','984','704','980','336','803','843','864','404','470','678','770','305','786','954','754','561','407','321','689','813','727','941','239','904','352','386','772','850'],
  'America/Chicago': ['312','773','872','630','708','847','224','815','262','414','608','715','612','651','763','952','314','636','816','913','785','316','405','918','512','737','713','281','832','214','469','972','817','682','210','726','504','985','225','318','601','205','256','901','615','629','865','423','931','270','502','859','319','515','563','402','531','605','701','504'],
  'America/Denver': ['303','720','970','719','801','385','435','505','575','406','307','208','986','602','480','623','520','928'],
  'America/Los_Angeles': ['213','323','310','424','818','747','626','562','714','657','949','951','909','858','619','760','442','415','628','510','925','650','408','669','831','916','279','559','209','707','530','702','725','775','206','253','425','360','509','503','971','541','458'],
  'America/Anchorage': ['907'],
  'Pacific/Honolulu': ['808'],
};
const AREA_TO_TZ = new Map<string, string>();
for (const [tz, codes] of Object.entries(TZ_BY_AREA)) for (const c of codes) AREA_TO_TZ.set(c, tz);

export function timezoneForNumber(e164: string): string {
  const m = e164.match(/^\+1(\d{3})/);
  return (m && AREA_TO_TZ.get(m[1])) || 'America/New_York';
}

export function localHour(tz: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
}

// ---- the check -----------------------------------------------------------------
export interface GuardInput {
  repEmail: string | null;
  phoneNumber: string | null;   // E.164 or null
  contact: { doNotCall?: boolean | null; companyType?: string | null };
  now?: Date;
}

export interface GuardResult {
  allowed: boolean;
  reasons: GuardReason[];
  detail: string[];               // human-readable, one per reason
  timezone: string | null;
}

export async function checkCall(input: GuardInput): Promise<GuardResult> {
  const rules = await getRules();
  const reasons: GuardReason[] = [];
  const detail: string[] = [];
  const number = input.phoneNumber;

  if (number && rules.dncList.includes(number)) {
    reasons.push('DNC_INTERNAL'); detail.push('This number is on the internal Do Not Call list.');
  }
  if (rules.enforceCrmDnc && input.contact.doNotCall) {
    reasons.push('DNC_CRM'); detail.push('This contact is flagged Do Not Call in Twenty.');
  }

  const perm = input.repEmail ? rules.repPermissions[input.repEmail.toLowerCase()] : undefined;
  const allowedTypes = perm?.companyTypes ?? rules.defaultCompanyTypes;
  if (allowedTypes !== 'ALL') {
    const ct = input.contact.companyType;
    if (!ct || !allowedTypes.map((t) => t.toLowerCase()).includes(ct.toLowerCase())) {
      reasons.push('COMPANY_TYPE');
      detail.push(ct ? `You are not permitted to call "${ct}" companies.` : 'This company has no Company Type set, and your permissions require one.');
    }
  }

  let timezone: string | null = null;
  if (rules.callingHours.enabled && number) {
    timezone = timezoneForNumber(number);
    const h = localHour(timezone, input.now);
    if (h < rules.callingHours.startHour || h >= rules.callingHours.endHour) {
      reasons.push('CALLING_HOURS');
      detail.push(`It is ${h}:00 for this contact (${timezone}); calls are allowed ${rules.callingHours.startHour}:00–${rules.callingHours.endHour}:00 local time.`);
    }
  }

  return { allowed: reasons.length === 0, reasons, detail, timezone };
}
