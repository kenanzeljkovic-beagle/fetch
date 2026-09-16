import type { Contact } from '../lib/api';

const BADGE: Record<string, string> = { DNC_INTERNAL: 'DNC', DNC_CRM: 'DNC', COMPANY_TYPE: 'Not permitted', CALLING_HOURS: 'Outside hours', REP_UNKNOWN: 'No rep' };
const badge = (reasons: string[]) => [...new Set(reasons.map((r) => BADGE[r] ?? r))].join(' · ');
const initials = (name: string) => name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function ContactList({ contacts, selectedId, onSelect, disabled }: {
  contacts: Contact[]; selectedId: string | null; onSelect: (c: Contact) => void; disabled: boolean;
}) {
  if (!contacts.length) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed" style={{ borderColor: 'var(--fetch-line)' }}>
        <p className="text-sm" style={{ color: 'var(--fetch-muted)' }}>No contacts found</p>
      </div>
    );
  }
  return (
    <ul className="-mx-1 max-h-[520px] space-y-0.5 overflow-auto">
      {contacts.map((c) => {
        const active = selectedId === c.id;
        const blocked = c.guard && !c.guard.allowed;
        return (
          <li key={c.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(c)}
              className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={active ? { background: '#FFF1E2' } : undefined}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                  style={{ background: active ? '#FFDFB8' : '#F1EBE3', color: active ? 'var(--fetch-orange)' : 'var(--fetch-muted)' }}
                >
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" style={{ color: 'var(--fetch-ink)' }}>{c.name}</span>
                    {blocked && (
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: '#FBEDEA', color: '#B3372B' }}>
                        {badge(c.guard!.reasons)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--fetch-muted)' }}>
                    {c.company ?? '—'}{c.companyType ? ` (${c.companyType})` : ''}
                    {c.phone ? ` · ${c.phone}` : c.phoneRaw ? ` · ${c.phoneRaw} (invalid)` : ' · no phone'}
                  </div>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
