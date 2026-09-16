import { useState } from 'react';
import { api, ApiError, type CallRecord, type Disposition } from '../lib/api';
import { DISPOSITIONS } from './CallPanel';

/**
 * Calls that ended but were never logged — e.g. the page was refreshed mid-call, or Twenty
 * was down when "Log Call" was pressed. The record on the server keeps the original
 * contact ID, so logging from here still lands on the right person.
 */
export function PendingCalls({ calls, onChanged }: { calls: CallRecord[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!calls.length) return null;

  const finish = async (c: CallRecord, d: Disposition) => {
    setBusy(c.id); setErrors((e) => ({ ...e, [c.id]: '' }));
    try {
      if (['initiated', 'calling', 'connected'].includes(c.status)) {
        // Page was refreshed mid-call: close the record out as ended now
        await api.updateStatus(c.id, { status: c.status === 'connected' ? 'completed' : 'no-answer', endedAt: new Date().toISOString() });
      }
      if (c.disposition !== d) await api.setDisposition(c.id, d);
      await api.logCall(c.id);
      onChanged();
    } catch (e) {
      setErrors((err) => ({ ...err, [c.id]: e instanceof ApiError ? e.message : 'Could not log this call.' }));
    } finally { setBusy(null); }
  };

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Unlogged calls</div>
      <ul className="mt-2 space-y-3">
        {calls.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="font-medium">{c.contactName} <span className="font-mono text-neutral-600">{c.phoneNumber}</span> <span className="text-neutral-500">· {c.status}</span></div>
            {c.lastLogError && <div className="text-xs text-red-700 mt-0.5">Last attempt: {c.lastLogError}</div>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DISPOSITIONS.map((d) => (
                <button key={d.key} type="button" disabled={busy === c.id} onClick={() => finish(c, d.key)}
                  className={`rounded border px-2 py-1 text-xs bg-white ${c.disposition === d.key ? 'border-[var(--fetch-orange)] font-semibold' : 'border-neutral-300'} disabled:opacity-50`}>
                  {busy === c.id ? '…' : `Log as ${d.label}`}
                </button>
              ))}
            </div>
            {errors[c.id] && <div className="text-xs text-red-700 mt-1">{errors[c.id]}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
