import type { Contact } from '../lib/api';
import { Phone } from './icons';

function display(e164: string | null, raw: string | null) {
  if (e164) { const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164; }
  return raw ?? '';
}

const initials = (name: string) => name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function ContactCard({ contact, onCall, callDisabled }: { contact: Contact | null; onCall: () => void; callDisabled: boolean }) {
  if (!contact) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed" style={{ borderColor: 'var(--fetch-line)' }}>
        <p className="text-sm" style={{ color: 'var(--fetch-muted)' }}>Select a contact to see their details</p>
      </div>
    );
  }

  const phoneProblem = !contact.phoneRaw ? 'This contact has no phone number in Twenty.'
    : !contact.phone ? `"${contact.phoneRaw}" can't be normalised to a valid number.` : null;
  const blocked = contact.guard ? !contact.guard.allowed : false;

  return (
    <div>
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold"
          style={{ background: '#FFE4CC', color: 'var(--fetch-orange)' }}
        >
          {initials(contact.name)}
        </div>
        <div className="min-w-0 pt-0.5">
          <div className="truncate text-base font-semibold leading-5" style={{ color: 'var(--fetch-ink)' }}>{contact.name}</div>
          <div className="truncate text-sm leading-5" style={{ color: 'var(--fetch-muted)' }}>
            {contact.company ?? 'No company'}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1 border-t pt-3" style={{ borderColor: 'var(--fetch-line)' }}>
        <div className="font-mono text-lg tabular-nums" style={{ color: display(contact.phone, contact.phoneRaw) ? 'var(--fetch-ink)' : 'var(--fetch-faint)' }}>
          {display(contact.phone, contact.phoneRaw) || 'No phone number'}
        </div>
        {contact.email && <div className="text-sm" style={{ color: 'var(--fetch-muted)' }}>{contact.email}</div>}
      </div>

      {phoneProblem && <p className="mt-2 text-sm" style={{ color: 'var(--fetch-red)' }}>{phoneProblem}</p>}

      {blocked && contact.guard && (
        <div className="mt-3 rounded-md px-3 py-2.5 text-sm" style={{ background: '#FBEDEA', border: '1px solid #F3D3CB', color: '#7A2A20' }}>
          <div className="font-semibold">Call restricted</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {contact.guard.detail.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </div>
      )}
      {!blocked && contact.guard?.timezone && (
        <p className="mt-2 text-xs" style={{ color: 'var(--fetch-faint)' }}>
          Local time zone: {contact.guard.timezone.replace('America/', '').replace('_', ' ')}
        </p>
      )}

      <button
        type="button"
        onClick={onCall}
        disabled={callDisabled || !contact.phone || blocked}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white transition-[filter] hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--fetch-orange)' }}
      >
        <Phone size={16} />
        Call
      </button>
    </div>
  );
}
