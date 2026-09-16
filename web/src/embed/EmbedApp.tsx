/**
 * EmbedApp — the container behind /?embed=1 (the dialer panel inside Twenty's dock).
 *
 * Owns embed-only state (session queue, theme, timer, postMessage bridge) and drives EmbedDialer
 * with the same pieces the standalone app uses: the `api` client, TelnyxDialer/MockDialer, the
 * ringback tone, and the disposition list. Guard, call records, and note logging all stay on the
 * server exactly as in Phase 1 — this file only sequences those calls.
 *
 * Contact association: a call from Twenty carries { objectType, recordId } from the page URL.
 * The server re-reads that record by id and decides the name, the Guard inputs, and where the
 * note goes. Names shown here before the server answers are display-only.
 */
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, sessionId, type CallRecord, type Disposition } from '../lib/api';
import { MockDialer, TelnyxDialer, type DialEvent, type Dialer } from '../lib/dialer';
import { startRingback, stopRingback } from '../lib/tones';
import { DISPOSITIONS } from '../components/CallPanel';
import EmbedDialer, { formatPhone, type CallState, type EmbedContact, type LogStatus, type QueueItem, type Stats } from './EmbedDialer';
import { onParentMessage, sendToParent, type EmbedContactRef, type ParentToEmbed } from './embedBridge';

type TwentyRef = Pick<EmbedContactRef, 'objectType' | 'recordId'>;
interface QueueEntry extends QueueItem { twenty: TwentyRef | null }
interface Current extends EmbedContact { twenty: TwentyRef | null }

const OUTCOMES = DISPOSITIONS.map((d) => ({ code: d.key, label: d.label }));
const ACTIVE: CallState[] = ['dialing', 'ringing', 'connected'];
/** Outcomes with side effects beyond the note need a second click. */
const CONFIRM_FIRST: Disposition[] = ['do_not_call'];

/** Keypad digits → E.164. Anything ambiguous is refused here and never reaches the server. */
function manualToE164(digits: string): string | null {
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  if (d.length >= 11 && d.length <= 15 && d[0] !== '1' && d[0] !== '0') return `+${d}`;
  return null;
}

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : (e as Error)?.message || fallback);

const toCurrent = (q: QueueEntry): Current => ({
  id: q.id,
  objectType: q.twenty?.objectType ?? null,
  name: q.name,
  company: q.company ?? null,
  phone: q.phone,
  twenty: q.twenty,
});

export default function EmbedApp() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [view, setView] = useState<'call' | 'manual'>('call');
  const [stats, setStats] = useState<Stats>({ callsToday: 0, connects: 0, talkSeconds: 0 });
  const [callerId, setCallerId] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);

  const [callState, setCallStateRaw] = useState<CallState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blockedDetail, setBlockedDetail] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [call, setCallRaw] = useState<CallRecord | null>(null);

  const [notes, setNotesRaw] = useState('');
  const [outcome, setOutcome] = useState<Disposition | null>(null);
  const [confirmOutcome, setConfirmOutcome] = useState<Disposition | null>(null);
  const [logStatus, setLogStatus] = useState<LogStatus | null>(null);

  const [manualDigits, setManualDigits] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Async handlers (Telnyx events, postMessage, timers) read these instead of stale render state.
  const stateRef = useRef<CallState>('idle');
  const callRef = useRef<CallRecord | null>(null);
  const notesRef = useRef('');
  const repRef = useRef('');
  const phaseStartRef = useRef<number | null>(null);
  const endedRef = useRef(false);
  const notesTimer = useRef<number | null>(null);
  const confirmTimer = useRef<number | null>(null);
  const dialerPromise = useRef<Promise<Dialer> | null>(null);

  const setCallState = (s: CallState) => { stateRef.current = s; setCallStateRaw(s); };
  const setCall = (c: CallRecord | null) => { callRef.current = c; setCallRaw(c); };
  const setNotes = (v: string) => { notesRef.current = v; setNotesRaw(v); };
  const busy = () => stateRef.current === 'checking' || ACTIVE.includes(stateRef.current);

  /** Same dialer the standalone app builds, but connected on mount instead of on first call. */
  const getDialer = (): Promise<Dialer> => {
    if (!dialerPromise.current) {
      const p = (async () => {
        const t = await api.telnyxToken();
        setCallerId(t.callerNumber);
        const d: Dialer = t.mock ? new MockDialer() : new TelnyxDialer(t.token!, t.callerNumber);
        await d.ready();
        return d;
      })();
      p.catch(() => { if (dialerPromise.current === p) dialerPromise.current = null; }); // next dial retries
      dialerPromise.current = p;
    }
    return dialerPromise.current;
  };

  const loadStats = () => { api.statsToday(repRef.current || null).then(setStats).catch(() => { /* header stats are non-critical */ }); };

  /** Server-confirmed name/company for a Twenty record replaces whatever the page scraped. */
  const applyRecordInfo = (recordId: string, info: { name: string; company: string | null }) => {
    setCurrent((c) => (c?.twenty?.recordId === recordId ? { ...c, name: info.name, company: info.company } : c));
    setQueue((q) => q.map((it) => (it.twenty?.recordId === recordId ? { ...it, name: info.name, company: info.company } : it)));
  };

  /** Clears the previous call from the panel. Its record stays in the store (unlogged if no outcome was picked). */
  const resetCall = () => {
    if (callRef.current) setNotes(''); // notes typed before the first dial carry over; a finished call's do not
    if (notesTimer.current) { window.clearTimeout(notesTimer.current); notesTimer.current = null; }
    if (confirmTimer.current) { window.clearTimeout(confirmTimer.current); confirmTimer.current = null; }
    setCall(null);
    endedRef.current = false;
    phaseStartRef.current = null;
    setError(null); setBlockedDetail([]); setOutcome(null); setConfirmOutcome(null); setLogStatus(null); setSeconds(0);
    setCallState('idle');
  };

  const scheduleNotesSave = () => {
    const cur = callRef.current;
    if (!cur || cur.loggedAt) return;
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    notesTimer.current = window.setTimeout(() => {
      notesTimer.current = null;
      api.saveNotes(cur.id, notesRef.current).catch((e) => setError(errMsg(e, 'Notes did not save — check your connection.')));
    }, 600);
  };

  /** Notes → disposition → note in Twenty (or local-only for a manual dial). Idempotent on the server. */
  const logCall = async (callId: string, disposition: Disposition | null) => {
    const stillCurrent = () => callRef.current?.id === callId;
    setLogStatus({ state: 'logging', message: 'Logging…' });
    try {
      if (notesTimer.current) { window.clearTimeout(notesTimer.current); notesTimer.current = null; }
      await api.saveNotes(callId, notesRef.current).catch(() => { /* logCall surfaces real problems */ });
      if (disposition) {
        const r = await api.setDisposition(callId, disposition);
        if (stillCurrent()) setCall(r.call);
      }
      const r = await api.logCall(callId);
      loadStats();
      if (!stillCurrent()) return;
      setCall(r.call);
      const dnc = disposition === 'do_not_call' ? ' Number added to Do Not Call.' : '';
      setLogStatus(r.noContact
        ? { state: 'local', message: `Saved in Fetch. This number isn't a Twenty record, so no note was written.${dnc}` }
        : { state: 'logged', message: `Logged to Twenty${r.mock ? ' (mock)' : ''}.${dnc}` });
    } catch (e) {
      if (stillCurrent()) setLogStatus({ state: 'failed', message: `${errMsg(e, 'Could not log the call.')} Pick an outcome to retry.` });
    }
  };

  const onDialEvent = async (e: DialEvent) => {
    const cur = callRef.current;
    if (!cur || endedRef.current) return;
    try {
      if (e.state === 'calling') {
        // The dialer's first "calling" is local (before Telnyx answers); one with a call id means it's ringing out.
        if (e.telnyxCallId && stateRef.current === 'dialing') {
          setCallState('ringing');
          await api.updateStatus(cur.id, { status: 'calling', telnyxCallId: e.telnyxCallId });
        }
      } else if (e.state === 'connected') {
        if (stateRef.current === 'connected') return;
        phaseStartRef.current = Date.now();
        setSeconds(0);
        setCallState('connected');
        const r = await api.updateStatus(cur.id, { status: 'connected', telnyxCallId: e.telnyxCallId, startedAt: new Date().toISOString() });
        if (!endedRef.current && callRef.current?.id === cur.id) setCall(r.call);
      } else if (e.state === 'ended' || e.state === 'failed') {
        endedRef.current = true;
        if (e.error) setError(e.error);
        const status = e.state === 'failed' ? 'failed' : e.neverConnected ? 'no-answer' : 'completed';
        setCallState('ended');
        setLogStatus((s) => s ?? {
          state: 'pending',
          message: cur.twentyContactId ? 'Pick an outcome to log this call to Twenty.' : 'Pick an outcome to save this call in Fetch.',
        });
        // Pre-select the obvious outcome (same as the standalone app); nothing is logged until the rep clicks one.
        setOutcome((d) => d ?? (status === 'completed' ? 'connected' : status === 'no-answer' ? 'no_answer' : null));
        const r = await api.updateStatus(cur.id, { status, telnyxCallId: e.telnyxCallId ?? cur.telnyxCallId, endedAt: new Date().toISOString() });
        if (callRef.current?.id === cur.id) {
          setCall(r.call);
          if (r.call.startedAt && r.call.durationSeconds != null) setSeconds(r.call.durationSeconds);
        }
        loadStats();
      }
    } catch (err) {
      setError(err instanceof ApiError ? `Server update failed: ${err.message}` : 'Server update failed.');
    }
  };

  /** Server record (normalise + Guard, by record id) → Telnyx dial. Mirrors App.startCall. */
  const placeCall = async (target: Current) => {
    if (busy()) return;
    resetCall();
    setCurrent(target);
    setView('call');
    setCallState('checking');
    try {
      const r = await api.createCall({
        twenty: target.twenty,
        contactName: target.name || target.phone,
        phoneNumber: target.phone,
        sessionId,
        repEmail: repRef.current || null,
      });
      setCall(r.call);
      if (r.contact && target.twenty) applyRecordInfo(target.twenty.recordId, r.contact);
      if (notesRef.current) scheduleNotesSave();
      phaseStartRef.current = Date.now();
      setCallState('dialing');
      const dialer = await getDialer();
      await dialer.dial(r.call.phoneNumber, onDialEvent);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BLOCKED') {
        const blocked: CallRecord | null = e.body.call ?? null;
        if (e.body.contact && target.twenty) applyRecordInfo(target.twenty.recordId, e.body.contact);
        setCall(blocked);
        setBlockedDetail(Array.isArray(e.body.detail) && e.body.detail.length ? e.body.detail : [e.message]);
        setCallState('blocked');
        if (blocked) logCall(blocked.id, null); // "Blocked by Fetch Guard: …" on the record (local-only for a manual dial)
        return;
      }
      setError(errMsg(e, 'Could not start the call.'));
      // If the dialer already reported the failure, the record is closed out and outcomes are available.
      if (!endedRef.current) { setCall(null); setCallState('idle'); }
    }
  };

  const onDialMessage = (phone: string, ref: EmbedContactRef | null) => {
    const twenty = ref ? { objectType: ref.objectType, recordId: ref.recordId } : null;
    const id = twenty ? `${twenty.objectType}:${twenty.recordId}:${phone}` : phone;
    const entry: QueueEntry = { id, name: ref?.name || formatPhone(phone), company: ref?.company || null, phone, twenty };
    setQueue((q) => (q.some((x) => x.id === id) ? q : [...q, entry]));
    if (busy()) return; // queued behind the current call
    setActiveQueueId(id);
    placeCall(toCurrent(entry));
  };

  const handleMessage = (m: ParentToEmbed) => {
    switch (m.type) {
      case 'FETCH_INIT':
        repRef.current = String(m.repEmail || '').trim().toLowerCase();
        if (m.theme === 'light' || m.theme === 'dark') setTheme(m.theme);
        loadStats();
        break;
      case 'FETCH_THEME':
        if (m.theme === 'light' || m.theme === 'dark') setTheme(m.theme);
        break;
      case 'FETCH_OPEN':
        if (m.view === 'call' || m.view === 'manual') setView(m.view);
        break;
      case 'FETCH_DIAL':
        if (typeof m.phone === 'string' && m.phone) onDialMessage(m.phone, m.contact ?? null);
        break;
    }
  };
  const handlerRef = useRef(handleMessage);
  handlerRef.current = handleMessage;

  // Mount: listen, connect Telnyx, then tell the extension we're ready (it queues messages until then).
  useEffect(() => {
    let cancelled = false;
    const off = onParentMessage((m) => handlerRef.current(m));
    getDialer()
      .catch((e) => { if (!cancelled) setError(errMsg(e, 'Could not connect to Telnyx.')); })
      .finally(() => { if (!cancelled) sendToParent({ type: 'FETCH_READY' }); });
    return () => {
      cancelled = true;
      off();
      const p = dialerPromise.current;
      dialerPromise.current = null;
      p?.then((d) => d.destroy()).catch(() => { /* never connected */ });
    };
  }, []);

  // Timer: from dial start while dialing/ringing, from answer once connected.
  useEffect(() => {
    if (!ACTIVE.includes(callState)) return;
    const tick = () => setSeconds(phaseStartRef.current ? Math.floor((Date.now() - phaseStartRef.current) / 1000) : 0);
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [callState]);

  useEffect(() => {
    if (callState === 'dialing' || callState === 'ringing') startRingback(); else stopRingback();
    return () => stopRingback();
  }, [callState]);

  // The pill in Twenty mirrors this: every state change, and every second while a call is live.
  const contactName = current ? current.name || formatPhone(current.phone) : '';
  useEffect(() => {
    sendToParent({ type: 'FETCH_STATE', state: callState, seconds, contactName });
  }, [callState, seconds, contactName]);

  const onOutcome = (code: string) => {
    const cur = callRef.current;
    const d = code as Disposition;
    if (!cur) return;
    if (CONFIRM_FIRST.includes(d) && confirmOutcome !== d) {
      setConfirmOutcome(d);
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmOutcome(null), 5000);
      return;
    }
    if (confirmTimer.current) { window.clearTimeout(confirmTimer.current); confirmTimer.current = null; }
    setConfirmOutcome(null);
    setOutcome(d);
    // During the call a click only pre-selects; the note is written once the call is over.
    if (stateRef.current === 'ended' || stateRef.current === 'blocked') logCall(cur.id, d);
  };

  const onSelectQueue = (item: QueueItem) => {
    if (busy()) return;
    const entry = queue.find((q) => q.id === item.id);
    if (!entry) return;
    resetCall();
    setActiveQueueId(entry.id);
    setCurrent(toCurrent(entry));
  };

  const onManualCall = () => {
    const digits = manualDigits.replace(/\D/g, '');
    const e164 = manualToE164(digits);
    if (!e164) {
      setManualError(digits ? 'Enter a 10-digit US number, or a full international number starting with its country code.' : 'Enter a number to call.');
      return;
    }
    if (busy()) { setManualError('Finish the current call first.'); return; }
    setManualError(null);
    setManualDigits('');
    setActiveQueueId(null);
    placeCall({ id: null, objectType: null, name: null, company: null, phone: e164, twenty: null });
  };

  const logLocked = logStatus?.state === 'logging' || logStatus?.state === 'logged' || logStatus?.state === 'local';

  return (
    <EmbedDialer
      theme={theme}
      view={view}
      onViewChange={(v) => { setView(v); setManualError(null); }}
      onMinimize={() => sendToParent({ type: 'FETCH_MINIMIZE' })}
      stats={stats}
      queue={queue}
      activeQueueId={activeQueueId}
      onSelectQueue={onSelectQueue}
      contact={current}
      callerId={callerId}
      callState={callState}
      seconds={seconds}
      blockedDetail={blockedDetail}
      error={error}
      notes={notes}
      onNotesChange={(v) => { setNotes(v); scheduleNotesSave(); }}
      notesDisabled={logStatus?.state === 'logged' || logStatus?.state === 'local'}
      outcomes={OUTCOMES}
      outcome={outcome}
      onOutcome={onOutcome}
      outcomesDisabled={!call || callState === 'checking' || logLocked}
      confirmOutcome={confirmOutcome}
      logStatus={logStatus}
      onCall={() => { if (current) placeCall(current); }}
      onHangup={() => { dialerPromise.current?.then((d) => d.hangup()).catch(() => { /* nothing to hang up */ }); }}
      manualDigits={manualDigits}
      onManualDigitsChange={(d) => { setManualDigits(d); setManualError(null); }}
      onManualCall={onManualCall}
      manualError={manualError}
    />
  );
}
