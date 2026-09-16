import { Delete, Phone } from './icons';
import { playDtmf } from '../lib/tones';

const KEYS: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

function formatUS(digits: string) {
  const d = digits.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (d.length > 6) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  if (d.length > 3) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return digits;
}

/** Manual number entry — used when the rep is dialing a number that isn't a Twenty contact. */
export function Keypad({ value, onChange, onCall, disabled }: {
  value: string; onChange: (v: string) => void; onCall: () => void; disabled: boolean;
}) {
  const hasNumber = value.replace(/\D/g, '').length > 0;
  const press = (k: string) => { if (!disabled && value.replace(/\D/g, '').length < 15) { playDtmf(k); onChange(value + k); } };
  const backspace = () => { if (!disabled) onChange(value.slice(0, -1)); };

  return (
    <div>
      <div className="flex items-center gap-2 pb-3">
        <div
          className="flex-1 rounded-md px-3 py-2 text-center text-lg font-medium tabular-nums"
          style={{ background: '#FFFFFF', border: '1px solid var(--fetch-line)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: hasNumber ? 'var(--fetch-ink)' : 'var(--fetch-faint)' }}
        >
          {hasNumber ? formatUS(value) : 'Enter a number'}
        </div>
        <button
          type="button"
          aria-label="Delete last digit"
          onClick={backspace}
          disabled={disabled || !hasNumber}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-black/5 active:bg-black/10 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ color: 'var(--fetch-muted)' }}
        >
          <Delete size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-lg p-1.5" style={{ background: 'var(--fetch-ink)' }}>
        {KEYS.map(([digit, letters]) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            disabled={disabled}
            aria-label={letters ? `${digit} ${letters}` : digit}
            className="flex h-11 flex-col items-center justify-center rounded-md bg-white/5 transition-colors hover:bg-white/10 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className="text-base font-medium leading-none text-white tabular-nums">{digit}</span>
            <span className="mt-1 h-2.5 text-[9px] leading-none tracking-widest" style={{ color: '#C9BFB5' }}>{letters}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCall}
        disabled={disabled || !hasNumber}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white transition-[filter] hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--fetch-orange)' }}
      >
        <Phone size={16} />
        Call this number
      </button>
    </div>
  );
}
