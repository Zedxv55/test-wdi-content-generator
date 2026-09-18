// Image provider registry — server-side only, keys never leave the server.
// Providers:
//   openrouter-image : reference-capable (WDI pixels ARE transmitted). Default for WDI work.
//   pollinations     : TEXT-ONLY fallback/demo. Must be explicitly selected; never auto-used for fidelity work.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GEN_DIR = path.join(ROOT, 'data', 'generated');
try { fs.mkdirSync(GEN_DIR, { recursive: true }); } catch {}

export const QUALITY_PX = { Draft: 768, Standard: 1024, High: 1344, Ultra: 1536 };

export function aspectDims(aspect, longest) {
  const m = String(aspect || '1:1').match(/^(\d+)\s*:\s*(\d+)$/);
  let aw = 1, ah = 1;
  if (m) { aw = Number(m[1]); ah = Number(m[2]); }
  const L = Math.max(512, Math.min(1536, Number(longest) || 1024));
  let w, h;
  if (aw >= ah) { w = L; h = Math.round((L * ah) / aw); } else { h = L; w = Math.round((L * aw) / ah); }
  w = Math.max(512, Math.min(1536, w));
  h = Math.max(512, Math.min(1536, h));
  return { w, h };
}

function env(k) { return String(process.env[k] || '').trim(); }

// Billing guard: paid image calls require explicit opt-in.
// Set ALLOW_PAID_IMAGE=true in .env to enable (charges ~$0.04/image apply).
export function paidAllowed() {
  return /^true|1|yes$/i.test(env('ALLOW_PAID_IMAGE'));
}
export const PAID_COST_NOTE = 'Paid image model — usage billed by provider (about $0.04/image).';

function fail(code, message, extra = {}) {
  const e = new Error(message);
  e.code = code;
  Object.assign(e, extra);
  throw e;
}

// ---- reference transport: real bytes, WDI via same UA as the image proxy ----
export async function fetchReferenceBytes(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\/www\.wdi\.co\.th\//i.test(u)) fail('INVALID_REFERENCE', 'Only WDI references allowed: ' + u.slice(0, 80));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 WDI-Content-Generator' }, signal: ctrl.signal });
    if (!r.ok) fail('REFERENCE_DOWNLOAD_FAILED', `WDI HTTP ${r.status} for ${u.slice(0, 80)}`);
    const mime = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/')) fail('INVALID_REFERENCE', 'URL is not an image: ' + mime);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 3000) fail('INVALID_REFERENCE', 'Image payload too small, likely blocked/empty');
    return { url: u, mime, bytes: buf.length, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
  } finally { clearTimeout(timer); }
}

async function resolveReferences(urls, maxRefs) {
  const list = [...new Set((urls || []).map(u => String(u || '').trim()).filter(Boolean))];
  if (list.length > maxRefs) fail('TOO_MANY_REFERENCES', `Got ${list.length} references, max ${maxRefs} for this provider`, { supported: maxRefs });
  const out = [];
  for (const u of list) out.push(await fetchReferenceBytes(u));
  return out;
}

const openrouterImage = {
  id: 'openrouter-image',
  label: 'Reference AI (OpenRouter image model)',
  textOnly: false,
  caps() {
    return {
      aspectRatios: ['1:1', '4:5', '3:4', '4:3', '16:9', '9:16', '3:2', '2:3'],
      qualityModes: ['Standard', 'High'],
      sizes: [],
      maxReferences: 6,
      supportsImageReferences: true,
      supportsNegativePrompt: false
    };
  },
  configured() { return Boolean(env('OPENROUTER_API_KEY')) && Boolean(env('OPENROUTER_IMAGE_MODEL')); },
  status() {
    const ok = this.configured();
    const allowed = paidAllowed();
    return {
      provider: this.id, label: this.label, configured: ok, paid: true, paidEnabled: allowed,
      usable: ok && allowed, textOnly: false,
      supportsReferences: ok && allowed, maxReferences: 6,
      model: ok ? env('OPENROUTER_IMAGE_MODEL') : '',
      paid: true, costNote: PAID_COST_NOTE, paidEnabled: allowed,
      message: !ok
        ? 'REFERENCE_IMAGE_PROVIDER_NOT_CONFIGURED — set OPENROUTER_API_KEY + OPENROUTER_IMAGE_MODEL'
        : allowed
          ? 'Configured + ENABLED. WDI reference pixels ARE transmitted (billed per image).'
          : 'Configured but DISABLED — set ALLOW_PAID_IMAGE=true in .env to enable (billed per image). No paid calls are made while disabled.'
    };
  },
  async generate({ prompt, references, aspect }) {
    if (!this.configured()) fail('REFERENCE_IMAGE_PROVIDER_NOT_CONFIGURED', 'Set OPENROUTER_API_KEY and OPENROUTER_IMAGE_MODEL in .env');
    if (!paidAllowed()) fail('PAID_DISABLED', 'Paid image generation is OFF. Set ALLOW_PAID_IMAGE=true in .env to enable (charges about $0.04/image). No charge was made.');
    const model = env('OPENROUTER_IMAGE_MODEL');
    const refs = await resolveReferences(references, 6);
    if (!refs.length) fail('NO_REFERENCES', 'Reference mode requires at least one WDI reference image');
    const content = [{ type: 'text', text: `${String(prompt).slice(0, 4000)}\n\nOutput: single product image, aspect ${aspect || '1:1'}. No text, logos, QR or watermark in the image.` }];
    for (const r of refs) content.push({ type: 'image_url', image_url: { url: r.dataUri } });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110000);
    try {
      const r = await fetch(`${env('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
          'HTTP-Referer': 'http://localhost:3077',
          'X-Title': 'WDI Content Generator'
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content }], modalities: ['image', 'text'], temperature: 0.4 }),
        signal: ctrl.signal
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (r.status === 429) fail('PROVIDER_429', 'Image provider rate-limited, try again later');
        if (r.status >= 500) fail('PROVIDER_5XX', `Image provider error HTTP ${r.status}`);
        fail('PROVIDER_ERROR', `Image provider HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      const msg = (j.choices || [])[0]?.message || {};
      const imgs = msg.images || [];
      const found = imgs.map(x => x?.image_url?.url).find(u => typeof u === 'string' && u.startsWith('data:image'));
      if (!found) fail('PROVIDER_ERROR', 'Provider returned no image data (model may not support image output)');
      const mime = (found.match(/^data:(image\/[^;]+);/) || [])[1] || 'image/png';
      const buf = Buffer.from(found.split(',')[1] || '', 'base64');
      if (buf.length < 5000) fail('PROVIDER_ERROR', 'Provider returned empty image');
      return { ok: true, mime, buffer: buf, refsSubmitted: refs.map(r => ({ url: r.url, bytes: r.bytes, mime: r.mime })) };
    } finally { clearTimeout(timer); }
  }
};

const pollinations = {
  id: 'pollinations',
  label: 'Pollinations FLUX (TEXT-ONLY demo)',
  textOnly: true,
  caps() {
    return {
      aspectRatios: ['1:1', '4:5', '3:4', '4:3', '16:9', '9:16'],
      qualityModes: ['Draft', 'Standard', 'High'],
      sizes: [768, 1024, 1344],
      maxReferences: 0,
      supportsImageReferences: false,
      supportsNegativePrompt: false
    };
  },
  configured() { return true; },
  status() {
    return {
      provider: this.id, label: this.label, configured: true, paid: false, paidEnabled: true,
      usable: true, textOnly: true,
      supportsReferences: false, maxReferences: 0, model: 'flux',
      message: 'TEXT-ONLY demo fallback. Reference images are NOT transmitted (prompt wording only). Select explicitly for demo use.'
    };
  },
  async generate({ prompt, w, h }) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 1500))}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 WDI-Content-Generator' }, signal: ctrl.signal });
      if (!r.ok) {
        if (r.status === 429) fail('PROVIDER_429', 'Demo provider rate-limited, try again later');
        fail('PROVIDER_5XX', `Demo provider HTTP ${r.status}`);
      }
      const mime = r.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) fail('PROVIDER_ERROR', 'Demo provider returned empty image');
      return { ok: true, mime, buffer: buf, refsSubmitted: [] };
    } finally { clearTimeout(timer); }
  }
};

const REGISTRY = { 'openrouter-image': openrouterImage, pollinations };

export function providerStatus() {
  return {
    defaultProvider: 'pollinations',
    defaultNote: 'Default is the FREE demo provider. Paid reference AI requires explicit selection + ALLOW_PAID_IMAGE=true.',
    providers: {
      'openrouter-image': { ...openrouterImage.status(), caps: openrouterImage.caps() },
      pollinations: { ...pollinations.status(), caps: pollinations.caps() }
    }
  };
}

export function saveAsset(buffer, mime) {
  const ext = /png/i.test(mime || '') ? 'png' : 'jpg';
  const name = `gen_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const abs = path.join(GEN_DIR, name);
  fs.writeFileSync(abs, buffer);
  return { rel: `data/generated/${name}`, bytes: buffer.length };
}

// opts: {provider:'auto'|'openrouter-image'|'demo', prompt, negativePrompt, references:[urls], aspect, quality, size}
// auto/demos: 'auto' (=reference-required) and 'demo' (=explicit text-only).
export async function providerGenerate(opts = {}) {
  const mode = String(opts.provider || 'auto').toLowerCase();
  if (mode === 'demo' || mode === 'pollinations') {
    const px = QUALITY_PX[opts.quality] || QUALITY_PX.Standard;
    const { w, h } = aspectDims(opts.aspect, opts.size || px);
    const out = await pollinations.generate({ prompt: opts.prompt, w, h });
    return { ...out, provider: 'pollinations', model: 'flux', pixelRefs: 0, width: w, height: h };
  }
  // reference path (also explicit 'openrouter-image')
  const caps = openrouterImage.caps();
  const aspect = String(opts.aspect || '1:1');
  if (!caps.aspectRatios.includes(aspect)) {
    fail('UNSUPPORTED_ASPECT_RATIO', `Aspect ${aspect} not supported by reference provider`, { supported: caps.aspectRatios });
  }
  const out = await openrouterImage.generate({ prompt: opts.prompt, references: opts.references, aspect });
  return { ...out, provider: 'openrouter-image', model: env('OPENROUTER_IMAGE_MODEL'), pixelRefs: out.refsSubmitted.length };
}
