// Image provider abstraction — browser never sees keys.
// Providers: pollinations (free, no key, TEXT-ONLY). Future providers
// (reference-capable) plug in behind the same interface.
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

const pollinations = {
  id: 'pollinations',
  label: 'Pollinations FLUX (free tier)',
  needsKey: false,
  textOnly: true,
  maxReferences: 0,
  status() {
    return {
      provider: 'pollinations', label: this.label, configured: true,
      textOnly: true,
      message: 'Free tier, no key required. Text-only: reference images shape the prompt wording, they are NOT sent as pixels.'
    };
  },
  async generate({ prompt, w, h }) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 1500))}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 WDI-Content-Generator' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`provider HTTP ${r.status} (free tier busy, try again)`);
      const mime = r.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error('provider returned empty image, try again');
      return { ok: true, mime, buffer: buf };
    } finally { clearTimeout(timer); }
  }
};

const REGISTRY = { pollinations };

export function providerStatus() {
  return pollinations.status();
}

export function saveAsset(buffer, mime) {
  const ext = /png/i.test(mime || '') ? 'png' : 'jpg';
  const name = `gen_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
  const abs = path.join(GEN_DIR, name);
  fs.writeFileSync(abs, buffer);
  return { rel: `data/generated/${name}`, bytes: buffer.length };
}

export async function providerGenerate({ prompt, w, h }) {
  return pollinations.generate({ prompt, w, h });
}
