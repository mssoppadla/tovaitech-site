'use strict';

/*
 * Tovaitech company site server.
 * Serves the static landing page plus Meta-compliant Privacy Policy and
 * User Data Deletion pages. All visible content is server-rendered from a
 * JSON content store that an authenticated admin can edit at runtime
 * (no redeploy). File-based store lives on a persistent volume.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
// Defaults are always bundled with the app image, separate from the (possibly
// empty) runtime DATA_DIR volume so a fresh volume still seeds correctly.
const DEFAULT_CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.default.json');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const COOKIE = 'tt_session';

if (!ADMIN_PASSWORD) {
  console.warn('[WARN] ADMIN_PASSWORD is not set — admin login is DISABLED until you set it.');
}

// ---------------------------------------------------------------------------
// Content store
// ---------------------------------------------------------------------------
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadContent() {
  ensureDataDir();
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[ERR] failed to read content.json, falling back to defaults:', e.message);
  }
  // Seed from defaults
  const def = JSON.parse(fs.readFileSync(DEFAULT_CONTENT_FILE, 'utf8'));
  try {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(def, null, 2));
  } catch (e) {
    console.error('[ERR] could not seed content.json:', e.message);
  }
  return def;
}

function saveContent(obj) {
  ensureDataDir();
  const tmp = CONTENT_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, CONTENT_FILE);
}

// ---------------------------------------------------------------------------
// Auth (signed cookie, no external session store)
// ---------------------------------------------------------------------------
function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  ensureDataDir();
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (_) {}
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch (_) {}
  return s;
}
const SECRET = getSecret();

function sign(payloadStr) {
  return crypto.createHmac('sha256', SECRET).update(payloadStr).digest('base64url');
}
function makeToken() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const p64 = Buffer.from(payload).toString('base64url');
  return p64 + '.' + sign(p64);
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return false;
  const [p64, sig] = token.split('.');
  if (sign(p64) !== sig) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch (_) {
    return false;
  }
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  h.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE];
  if (verifyToken(token)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// Escape but keep author-friendly newlines as <br>
function escMultiline(s) {
  return esc(s).replace(/\n/g, '<br/>');
}

function layout({ title, themeColor, body, extraHead }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="theme-color" content="${esc(themeColor || '#0e7c66')}"/>
<meta name="facebook-domain-verification" content="ri786akahsaiymuonr6abjqgx74mr6"/>
<title>${esc(title)}</title>
<link rel="stylesheet" href="/styles/app.css?v=5"/>
${extraHead || ''}
</head>
<body>
${body}
</body>
</html>`;
}

function headerHtml(c) {
  const s = c.site || {};
  return `<div class="top">
  <div class="brandlogo">${esc(s.brandInitial || 'T')}</div>
  <div><h1 style="font-size:1.05rem;margin:0">${esc(s.brandName || 'Tovaitech')}</h1><p>${esc(s.tagline || '')}</p></div>
</div>`;
}

function productCardHtml(p) {
  const soon = (p.status || '') !== 'g' ? ' soon' : '';
  let cta = '';
  if (p.ctaLabel && p.ctaHref) {
    const ghost = (p.status || '') !== 'g' ? ' ghost' : '';
    cta = `\n      <div class="linkrow"><a class="btn${ghost}" href="${esc(p.ctaHref)}">${esc(p.ctaLabel)}</a></div>`;
  }
  const note = p.note ? `\n      <p class="muted" style="margin-top:2px">${escMultiline(p.note)}</p>` : '';
  return `    <div class="product${soon}">
      <div class="hd"><div class="ic">${esc(p.icon || '')}</div><span class="pill ${esc(p.status || 'n')}">${esc(p.statusLabel || '')}</span></div>
      <h3>${esc(p.title || '')}</h3>
      <p>${escMultiline(p.body || '')}</p>${cta}${note}
    </div>`;
}

function renderLanding(c) {
  const hero = c.hero || {};
  const products = (c.products || []).map(productCardHtml).join('\n\n');
  const ml = hero.titleMl ? `<span class="ml">${esc(hero.titleMl)}</span>` : '';
  const body = `${headerHtml(c)}

<section class="hero">
  <h1>${esc(hero.title || '')}${ml}</h1>
  <p class="sub">${escMultiline(hero.subtitle || '')}</p>
</section>

<section class="sec">
  <h2>${esc(c.productsHeading || 'Our products')}</h2>
  <div class="products">

${products}

  </div>
</section>

<section class="sec" style="text-align:center">
  <p class="muted"><a href="/privacy">Privacy Policy</a> · <a href="/data-deletion">User Data Deletion</a></p>
</section>

<div class="foot2">${escMultiline(c.footer || '')}</div>`;

  const extraHead = `<style>
.hero{max-width:900px;margin:0 auto;padding:52px 16px 6px;text-align:center}
.hero h1{font-size:2.1rem;font-weight:700;margin:0 0 10px}
.hero p.sub{font-size:1.05rem;color:var(--muted);max-width:640px;margin:0 auto}
.ml{display:block;font-size:.8em;color:var(--muted);font-weight:500}
.sec{max-width:980px;margin:0 auto;padding:8px 16px}
.sec h2{font-size:1.05rem;margin:26px 0 12px}
.sec a{color:var(--brand)}
.products{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:720px){ .products{grid-template-columns:repeat(2,1fr)} }
.product{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:18px;display:flex;flex-direction:column;gap:8px}
.product .hd{display:flex;justify-content:space-between;align-items:center;gap:8px}
.product h3{margin:0;font-size:1.05rem}
.product p{margin:0;font-size:.86rem;color:var(--muted);flex:1}
.product .ic{width:38px;height:38px;border-radius:10px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:20px;flex:0 0 auto}
.product.soon{opacity:.85}
.linkrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.linkrow .btn{width:auto;padding:10px 16px;font-size:.85rem;min-height:42px}
.foot2{max-width:980px;margin:22px auto;padding:18px 16px 48px;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem;text-align:center}
</style>`;

  return layout({
    title: c.site && c.site.title ? c.site.title : 'Tovaitech',
    themeColor: c.site && c.site.themeColor,
    body,
    extraHead,
  });
}

const LEGAL_HEAD = `<style>
.legal{max-width:760px;margin:0 auto;padding:28px 16px 64px}
.legal a{color:var(--brand)}
.legal .back{font-size:.82rem}
.legal h1{font-size:1.6rem;margin:14px 0 4px}
.legal .updated{color:var(--muted);font-size:.8rem;margin:0 0 18px}
.legal .intro{font-size:.95rem;color:var(--ink);margin:0 0 8px}
.legal h2{font-size:1.05rem;margin:24px 0 6px}
.legal p{font-size:.9rem;line-height:1.6;color:#334155;margin:0 0 10px}
.legal ol,.legal ul{font-size:.9rem;line-height:1.6;color:#334155;padding-left:22px;margin:0 0 12px}
.legal li{margin:0 0 6px}
.legal .box{background:var(--card);border:1px solid var(--line);border-radius:var(--r2);box-shadow:var(--shadow);padding:16px 18px;margin:0 0 16px}
</style>`;

function renderPrivacy(c) {
  const pv = c.privacy || {};
  const sections = (pv.sections || [])
    .map((s) => `  <h2>${esc(s.heading)}</h2>\n  <p>${escMultiline(s.body)}</p>`)
    .join('\n');
  const body = `${headerHtml(c)}
<main class="legal">
  <p class="back"><a href="/">← Back to home</a></p>
  <h1>${esc(pv.title || 'Privacy Policy')}</h1>
  <p class="updated">Last updated: ${esc(pv.lastUpdated || '')}</p>
  <p class="intro">${escMultiline(pv.intro || '')}</p>
${sections}
</main>
<div class="foot2">${escMultiline(c.footer || '')}</div>`;
  return layout({
    title: `${pv.title || 'Privacy Policy'} — ${c.site ? c.site.brandName : 'Tovaitech'}`,
    themeColor: c.site && c.site.themeColor,
    body,
    extraHead: LEGAL_HEAD,
  });
}

function renderDataDeletion(c) {
  const d = c.dataDeletion || {};
  const emailSteps = (d.emailSteps || []).map((s) => `    <li>${escMultiline(s)}</li>`).join('\n');
  const waSteps = (d.whatsappSteps || []).map((s) => `    <li>${escMultiline(s)}</li>`).join('\n');
  const body = `${headerHtml(c)}
<main class="legal">
  <p class="back"><a href="/">← Back to home</a></p>
  <h1>${esc(d.title || 'User Data Deletion')}</h1>
  <p class="updated">Last updated: ${esc(d.lastUpdated || '')}</p>
  <p class="intro">${escMultiline(d.intro || '')}</p>

  <div class="box">
    <h2>${esc(d.emailHeading || 'Request deletion by email')}</h2>
    <ol>
${emailSteps}
    </ol>
  </div>

  <div class="box">
    <h2>${esc(d.whatsappHeading || 'Request deletion on WhatsApp')}</h2>
    <ol>
${waSteps}
    </ol>
  </div>

  <h2>How long it takes</h2>
  <p>${escMultiline(d.timeline || '')}</p>
  <p>${escMultiline(d.contactNote || '')}</p>
</main>
<div class="foot2">${escMultiline(c.footer || '')}</div>`;
  return layout({
    title: `${d.title || 'User Data Deletion'} — ${c.site ? c.site.brandName : 'Tovaitech'}`,
    themeColor: c.site && c.site.themeColor,
    body,
    extraHead: LEGAL_HEAD,
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// Public, server-rendered pages
app.get('/', (_req, res) => res.type('html').send(renderLanding(loadContent())));
app.get(['/privacy', '/privacy.html'], (_req, res) =>
  res.type('html').send(renderPrivacy(loadContent())));
app.get(['/data-deletion', '/data-deletion.html'], (_req, res) =>
  res.type('html').send(renderDataDeletion(loadContent())));

// Admin UI (static page; content fetched via authed API).
// NOTE: namespaced under /site-admin and /site-api because the host proxy
// routes /admin and /api to the separate clinic-app (8080).
app.get('/site-admin', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// Auth
app.post('/site-api/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'admin disabled: ADMIN_PASSWORD not set' });
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'invalid password' });
  const secure = (req.headers['x-forwarded-proto'] || req.protocol) === 'https';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.post('/site-api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/site-api/session', (req, res) => {
  res.json({ authenticated: verifyToken(parseCookies(req)[COOKIE]), adminEnabled: !!ADMIN_PASSWORD });
});

// Content API
app.get('/site-api/content', requireAuth, (_req, res) => res.json(loadContent()));
app.get('/site-api/content/default', requireAuth, (_req, res) =>
  res.json(JSON.parse(fs.readFileSync(DEFAULT_CONTENT_FILE, 'utf8'))));

app.put('/site-api/content', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'content must be a JSON object' });
  }
  try {
    saveContent(body);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ERR] save content:', e.message);
    res.status(500).json({ error: 'failed to save content' });
  }
});

// Static assets (styles, etc.)
app.use(express.static(PUBLIC_DIR, { index: false, extensions: [] }));

app.listen(PORT, () => {
  loadContent(); // seed on boot
  console.log(`Tovaitech site listening on :${PORT}`);
});
