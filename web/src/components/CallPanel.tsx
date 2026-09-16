import { useEffect, useState } from 'react';
import type { CallRecord, Disposition } from '../lib/api';
import type { DialState } from '../lib/dialer';
import { Check, PhoneOff } from './icons';

export const DISPOSITIONS: { key: Disposition; label: string }[] = [
  { key: 'connected', label: 'Connected' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'busy', label: 'Busy' },
  { key: 'wrong_number', label: 'Wrong number' },
  { key: 'do_not_call', label: 'Do not call' },
  { key: 'other', label: 'Other' },
];

const STATUS: Record<DialState, { text: string; color: string; dot: string }> = {
  idle: { text: 'Ready', color: 'var(--fetch-muted)', dot: 'var(--fetch-faint)' },
  connecting: { text: 'Connecting to Telnyx', color: 'var(--fetch-muted)', dot: 'var(--fetch-orange)' },
  calling: { text: 'Calling', color: 'var(--fetch-muted)', dot: 'var(--fetch-orange)' },
  connected: { text: 'Connected', color: 'var(--fetch-green)', dot: 'var(--fetch-green)' },
  ended: { text: 'Call ended', color: 'var(--fetch-ink)', dot: 'var(--fetch-faint)' },
  failed: { text: 'Call failed', color: 'var(--fetch-red)', dot: 'var(--fetch-red)' },
  blocked: { text: 'Call blocked', color: 'var(--fetch-red)', dot: 'var(--fetch-red)' },
};

function Timer({ since }: { since: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--fetch-muted)' }}>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export function CallPanel(props: {
  dialState: DialState;
  call: CallRecord | null;
  error: string | null;
  onHangup: () => void;
  notes: string;
  onNotesChange: (v: string) => void;
  notesError?: string | null;
  disposition: Disposition | null;
  onDisposition: (d: Disposition) => void;
  onLog: () => void;
  logging: boolean;
  logged: boolean;
  logError: string | null;
  loggedNote?: string | null;
}) {
  const { dialState, call, error, onHangup, notes, onNotesChange, notesError, disposition, onDisposition, onLog, logging, logged, logError, loggedNote } = props;
  const inCall = dialState === 'calling' || dialState === 'connected' || dialState === 'connecting';
  const afterCall = (dialState === 'ended' || dialState === 'failed') && call;
  const status = STATUS[dialState];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />
          <span className="text-sm font-semibold" style={{ color: status.color }}>{status.text}</span>
        </div>
        {dialState === 'connected' && <Timer since={call?.startedAt ?? new Date().toISOString()} />}
        {dialState === 'ended' && call?.durationSeconds != null && (
          <span className="text-sm" style={{ color: 'var(--fetch-muted)' }}>{Math.floor(call.durationSeconds / 60)}m {call.durationSeconds % 60}s</span>
        )}
      </div>

      {dialState === 'blocked' && call?.blockedReasons && (
        <div className="mt-3 rounded-md px-3 py-2.5 text-sm" style={{ background: '#FBEDEA', border: '1px solid #F3D3CB', color: '#7A2A20' }}>
          <div className="font-semibold">Fetch Guard refused this call</div>
          <p className="mt-1">{error}</p>
          <p className="mt-1 text-xs opacity-80">Recorded as a blocked attempt ({call.blockedReasons.join(', ')}).</p>
        </div>
      )}
      {error && dialState !== 'blocked' && <p className="mt-2 text-sm" style={{ color: 'var(--fetch-red)' }}>{error}</p>}

      {inCall && (
        <button
          type="button"
          onClick={onHangup}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white transition-[filter] hover:brightness-95 active:brightness-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ background: 'var(--fetch-red)' }}
        >
          <PhoneOff size={16} />
          Hang up
        </button>
      )}

      {(inCall || afterCall) && (
        <div className="mt-4">
          <label htmlFor="call-notes" className="block text-xs font-medium" style={{ color: 'var(--fetch-muted)' }}>Notes</label>
          <textarea
            id="call-notes"
            value={notes}
            disabled={logged}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={inCall ? 2 : 3}
            placeholder={inCall ? 'Type while you talk…' : 'What happened on the call?'}
            className="mt-1.5 w-full resize-none rounded-md px-3 py-2 text-sm leading-5 placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ background: '#FFFFFF', border: '1px solid var(--fetch-line)', color: 'var(--fetch-ink)' }}
          />
          {notesError && <p className="mt-1 text-xs" style={{ color: 'var(--fetch-red)' }}>{notesError}</p>}
        </div>
      )}

      {afterCall && (
        <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--fetch-cream)', border: '1px solid var(--fetch-line)' }}>
          <label htmlFor="disposition" className="block text-xs font-medium" style={{ color: 'var(--fetch-muted)' }}>Outcome</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label="Call outcome">
            {DISPOSITIONS.map((d) => {
              const active = disposition === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={logged}
                  onClick={() => onDisposition(d.key)}
                  aria-pressed={active}
                  className="h-9 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={active
                    ? { background: '#FFE4CC', color: 'var(--fetch-orange)', border: '1px solid var(--fetch-orange)', fontWeight: 600 }
                    : { background: '#FFFFFF', color: 'var(--fetch-ink)', border: '1px solid var(--fetch-line)' }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {!logged ? (
            <button
              type="button"
              onClick={onLog}
              disabled={!disposition || logging}
              className="mt-3 h-10 w-full rounded-md text-sm font-semibold text-white transition-[filter] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: 'var(--fetch-ink)' }}
            >
              {logging ? 'Logging…' : logError ? 'Retry logging' : 'Log call'}
            </button>
          ) : (
            <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium" style={{ background: loggedNote ? '#FDF3E4' : '#E8F3EC', color: loggedNote ? '#8A5A12' : 'var(--fetch-green)' }}>
              <Check size={16} />
              {loggedNote ?? (notes.trim() ? 'Outcome and notes logged to Twenty' : 'Logged to Twenty')}
              {disposition === 'do_not_call' ? ' · added to Do Not Call' : ''}
            </div>
          )}
          {logError && !logged && <p className="mt-2 text-sm" style={{ color: 'var(--fetch-red)' }}>{logError}</p>}
        </div>
      )}
    </div>
  );
}
