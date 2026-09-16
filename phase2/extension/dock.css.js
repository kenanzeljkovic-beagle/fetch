// Styles for the Fetch dock, injected into a shadow root so Twenty's CSS can't touch them.
// Loaded before content.js (see manifest.json).
window.__FETCH_DOCK_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

.fd {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  font: 13px/1.4 Inter, -apple-system, "Segoe UI", system-ui, sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;

  --accent: #F26A1E;
  --green: #2FB36D;
  --red: #D6462F;
}
.fd[data-theme="light"] {
  --bg: #F4EDE3;
  --card: #FFFFFF;
  --line: #E8DED2;
  --text: #2B1F17;
  --muted: #8B7A6C;
  --accent-soft: #FDE9DA;
  --accent-line: #F3A06A;
  --shadow: 0 10px 30px rgba(43, 31, 23, 0.18), 0 2px 6px rgba(43, 31, 23, 0.08);
}
.fd[data-theme="dark"] {
  --bg: #1D1612;
  --card: #2A2119;
  --line: #3B2F26;
  --text: #F4EAE0;
  --muted: #A39284;
  --accent-soft: #3A2416;
  --accent-line: #C7601F;
  --shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
}

button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
button:focus-visible, .fd-pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ---- state 1: resting pill ------------------------------------------ */
.fd-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px 0 8px;
  border-radius: 999px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 320px;
}
.fd-pill:hover { border-color: var(--accent-line); }
.fd-logo { width: 24px; height: 24px; border-radius: 7px; flex: 0 0 auto; }
.fd-pill-name { font-weight: 600; }
.fd-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex: 0 0 auto; }
.fd-dot[data-state="dialing"], .fd-dot[data-state="ringing"] { background: var(--accent); animation: fd-pulse 1s ease-in-out infinite; }
.fd-dot[data-state="connected"] { background: var(--green); animation: fd-pulse 1.6s ease-in-out infinite; }
.fd-dot[data-state="blocked"] { background: var(--red); }
.fd-pill-status { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.fd-pill[data-active="1"] .fd-pill-status { color: var(--text); font-variant-numeric: tabular-nums; }
@keyframes fd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ---- state 2: quick-call card ---------------------------------------- */
.fd-card {
  position: absolute;
  right: 0;
  bottom: 52px;
  width: 290px;
  padding: 14px;
  border-radius: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.fd-card[hidden] { display: none; }
.fd-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.fd-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--accent-soft); color: var(--accent);
  font-weight: 700; font-size: 12px; flex: 0 0 auto;
}
.fd-card-name { font-weight: 600; }
.fd-card-sub { color: var(--muted); font-size: 12px; }
.fd-card-close {
  margin-left: auto; width: 26px; height: 26px; border-radius: 8px;
  color: var(--muted); display: grid; place-items: center; font-size: 16px; line-height: 1;
}
.fd-card-close:hover { background: var(--bg); color: var(--text); }
.fd-card-actions { display: flex; gap: 8px; }
.fd-btn {
  height: 36px; padding: 0 14px; border-radius: 9px;
  font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.fd-btn-primary { background: var(--accent); color: #fff; flex: 1; }
.fd-btn-primary:hover { filter: brightness(1.06); }
.fd-btn-quiet { background: var(--bg); color: var(--text); border: 1px solid var(--line); }
.fd-btn-quiet:hover { border-color: var(--accent-line); }

/* ---- state 3: full panel (the embedded Fetch app) --------------------- */
.fd-panel {
  position: absolute;
  right: 0;
  bottom: 52px;
  width: min(760px, calc(100vw - 40px));
  height: min(440px, calc(100vh - 92px));
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.fd-panel[hidden] { display: none; }
.fd-panel[data-preload="1"] {
  /* Kept mounted but out of sight so the Telnyx client is already connected on the first call. */
  display: block; width: 1px; height: 1px; opacity: 0; pointer-events: none; overflow: hidden;
  bottom: 0; right: 0; border: 0; box-shadow: none;
}
.fd-frame { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); }

.fd-toast {
  position: absolute; right: 0; bottom: 52px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow);
  color: var(--text); max-width: 320px;
}
.fd-toast[hidden] { display: none; }
.fd-toast b { color: var(--red); }

@media (prefers-reduced-motion: reduce) {
  .fd-dot { animation: none !important; }
}
`;
