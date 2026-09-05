const base = `http://localhost:${process.env.PORT || 3077}`;
async function json(path, options) {
  const r = await fetch(base + path, options);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, data };
}
const health = await json('/api/health');
if (health.status !== 200 || !health.data.ok) throw new Error('health failed');
if (health.data.products !== 1030) throw new Error(`unexpected product count: ${health.data.products}`);
if (health.data.templates !== 6) throw new Error(`unexpected template count: ${health.data.templates}`);
if (!health.data.ai?.dotenvLoaded || !health.data.ai?.openaiKeyConfigured) throw new Error('dotenv/OpenAI key not configured');
const products = await json('/api/products?q=00-082');
if (products.status !== 200 || !products.data.length) throw new Error('product search failed');
const templates = await json('/api/templates');
if (templates.status !== 200 || templates.data.length !== 6) throw new Error('template API failed');
console.log('SMOKE_PASS', JSON.stringify({ products: health.data.products, templates: health.data.templates, model: health.data.ai.model }));
