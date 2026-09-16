/**
 * embedHeaders — lets the Fetch web app be framed by Twenty (and nothing else).
 * Mounted in server/src/index.ts before the API routes and the static/web handler.
 *
 * Env (Railway → fetch service → Variables):
 *   EMBED_ALLOWED_ORIGINS = https://crm.yourcompany.com            (Corgi's Twenty origin)
 *   For local dev add the dev origins too, comma-separated, e.g.
 *   EMBED_ALLOWED_ORIGINS = https://crm.yourcompany.com,https://app.twenty.com
 *
 * If helmet is in use, its default frameguard sets X-Frame-Options: SAMEORIGIN, which wins
 * over frame-ancestors in some browsers. Disable that piece:
 *   app.use(helmet({ frameguard: false, contentSecurityPolicy: false }))   // simplest
 * or, if you keep helmet's CSP, set directives.frameAncestors to the same list instead of
 * using this middleware, so there is exactly one CSP header.
 */
import type { RequestHandler } from 'express';

export function embedHeaders(allowed?: string): RequestHandler {
  const origins = (allowed ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => { try { return new URL(s).origin; } catch { return s; } });

  const frameAncestors = ["'self'", ...origins].join(' ');

  return (_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
    next();
  };
}
