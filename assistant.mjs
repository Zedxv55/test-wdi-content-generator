// AI Assistant — rule-based intent parser over the PRODUCTION DATABASE.
// No direct SQL from LLM. Every answer cites DB rows. Never invents status.
import {
  productStatusSummary, getDashboard, getNextJobs, codesStatus,
  campaignProgress, initDb, getActions
} from './db.mjs';

const V_RE = /V0?\d|V1[0-5]/i;
const CODE_RE = /\b\d{2,3}-[0-9A-Z]{2,}\b/i;

function vnorm(v) {
  const m = String(v || '').toUpperCase().match(/V0?(\d+)/);
  if (!m) return null;
  return 'V' + String(Number(m[1])).padStart(2, '0');
}

function jobLine(j) {
  const pub = j.publish
    ? ['facebook', 'instagram', 'line', 'tiktok'].map(k => `${k}=${j.publish[k + '_status']}`).join(', ')
    : 'ยังไม่เคยตั้ง publish';
  return `${j.v_code}/${j.s_code || '-'} สถานะ ${j.status} (v${j.current_version}, ทั้งหมด ${j.versions} เวอร์ชัน) | ${pub}`;
}

export function askAssistant(question) {
  initDb();
  const q = String(question || '').trim();
  if (!q) return { intent: 'empty', answer: 'ถามมาได้เลย เช่น "04-60610L ทำถึงไหนแล้ว" หรือ "ตัวไหนยังไม่ทำ"' };
  const codeM = q.match(CODE_RE);
  const vM = q.match(V_RE);

  // 1) specific product (+optional V)
  if (codeM) {
    const code = codeM[0].toUpperCase();
    const ps = productStatusSummary(code);
    if (!ps.exists || !ps.jobs.length) {
      return { intent: 'product_status', code, answer: `${code}: ยังไม่เคยเริ่มทำ (ไม่มี job ในฐานข้อมูล)`, data: ps, sources: ['production_db'] };
    }
    if (vM) {
      const v = vnorm(vM[0]);
      const j = ps.jobs.find(x => x.v_code === v);
      if (!j) return { intent: 'product_v_status', code, v, answer: `${code}: ยังไม่เคยทำ ${v} (ที่ทำแล้ว: ${ps.jobs.map(x => x.v_code).join(', ') || 'ไม่มี'})`, data: ps, sources: ['production_db'] };
      return { intent: 'product_v_status', code, v, answer: `${code} ${v}: ${jobLine(j)}`, data: { job: j }, sources: ['production_db'] };
    }
    const lines = ps.jobs.map(jobLine).join('\n');
    return { intent: 'product_status', code, answer: `${code} (${ps.product.name_th || ps.product.name_en}):\n${lines}`, data: ps, sources: ['production_db'] };
  }

  // 2) how many products did Vn
  if (vM && /กี่|เท่าไร|เท่าไหร่|นับ|จำนวน/.test(q)) {
    const d = getDashboard();
    const row = d.v_done_counts.find(r => r.v_code === vnorm(vM[0]));
    const n = row ? row.c : 0;
    return { intent: 'v_count', v: vnorm(vM[0]), answer: `${vnorm(vM[0])} ทำไปแล้ว ${n} สินค้า (นับเฉพาะ job ที่ generate สำเร็จ)`, data: { count: n }, sources: ['production_db'] };
  }

  // 3) unfinished
  if (/ยังไม่(ทำ|ได้ทำ|มี)|ยังไม่ได้|เหลือ.*(เท่าไร|กี่|บ้าง)|ค้าง/.test(q) && !/publish|ลง|QC|คิวซี/i.test(q)) {
    const d = getDashboard();
    const next = getNextJobs(5);
    const sug = next.map((n, i) => `${i + 1}. ${n.product_code} (${n.product_name_th || n.product_name_en}) — ${n.why.join(', ')}`).join('\n');
    return { intent: 'unfinished', answer: `ยังไม่ทำ ${d.products_untouched} จาก ${d.products_total} สินค้า\nแนะนำทำต่อ:\n${sug}`, data: { untouched: d.products_untouched, suggestions: next }, sources: ['production_db'] };
  }

  // 4) QC failed / revision
  if (/QC.*(ไม่ผ่าน|ตก)|ไม่ผ่าน|ต้องแก้|revision|แก้/.test(q)) {
    const d = getDashboard();
    if (!d.attention.length) return { intent: 'qc_attention', answer: 'ไม่มีงาน QC ไม่ผ่าน / ต้องแก้ (ฐานข้อมูลสะอาด)', data: [], sources: ['production_db'] };
    const lines = d.attention.map(a => `${a.product_code} ${a.v_code}: ${a.status}`).join('\n');
    return { intent: 'qc_attention', answer: `งานที่ต้องดู (${d.attention.length}):\n${lines}`, data: d.attention, sources: ['production_db'] };
  }

  // 5) publish gap, e.g. "FB แล้วแต่ TikTok ยัง"
  if (/publish|ลง|โพสต์|post/i.test(q) || /(facebook|fb|ig|instagram|tiktok|line).*(ยัง|แต่)/i.test(q)) {
    const d = initDb();
    const rows = d.prepare(`SELECT p.product_code,j.v_code,ps.facebook_status,ps.instagram_status,ps.line_status,ps.tiktok_status
      FROM publish_status ps JOIN production_jobs j ON j.id=ps.job_id JOIN products p ON p.id=j.product_id
      WHERE NOT (ps.facebook_status='PUBLISHED' AND ps.instagram_status='PUBLISHED' AND ps.line_status='PUBLISHED' AND ps.tiktok_status='PUBLISHED')
      LIMIT 20`).all();
    if (!rows.length) return { intent: 'publish_gap', answer: 'ไม่มีงานค้าง publish (ทุก job ที่ตั้ง publish ไว้ครบ 4 ช่องทาง หรือยังไม่เคยตั้ง)', data: [], sources: ['production_db'] };
    const lines = rows.map(r => `${r.product_code} ${r.v_code}: FB=${r.facebook_status} IG=${r.instagram_status} LINE=${r.line_status} TT=${r.tiktok_status}`).join('\n');
    return { intent: 'publish_gap', answer: `งานที่ publish ไม่ครบ (${rows.length} แถวแรก):\n${lines}`, data: rows, sources: ['production_db'] };
  }

  // 6) today
  if (/วันนี้|today/.test(q)) {
    const d = initDb();
    const day = new Date().toISOString().slice(0, 10);
    const acts = d.prepare(`SELECT a.action_type,a.created_at,p.product_code,j.v_code FROM production_actions a
      LEFT JOIN production_jobs j ON j.id=a.job_id LEFT JOIN products p ON p.id=j.product_id
      WHERE substr(a.created_at,1,10)=? ORDER BY a.id DESC LIMIT 30`).all(day);
    if (!acts.length) return { intent: 'today', answer: 'วันนี้ยังไม่มี action ในฐานข้อมูล', data: [], sources: ['production_db'] };
    const gens = acts.filter(a => a.action_type === 'GENERATE_COMPLETED').length;
    const lines = acts.slice(0, 15).map(a => `${a.created_at.slice(11, 16)} ${a.action_type} ${a.product_code || ''} ${a.v_code || ''}`.trim()).join('\n');
    return { intent: 'today', answer: `วันนี้ ${acts.length} actions (generate สำเร็จ ${gens}):\n${lines}`, data: acts, sources: ['production_db'] };
  }

  // 7) recommend next
  if (/แนะนำ|ควรทำ|ตัวไหนต่อ|ถัดไป|next|ทำอะไร/.test(q)) {
    const next = getNextJobs(5);
    if (!next.length) return { intent: 'recommend', answer: 'ไม่มีสินค้าเหลือให้ทำ (ทุกตัวที่มีรูปมี job หมดแล้ว)', data: [], sources: ['production_db'] };
    const top = next[0];
    const lines = next.map((n, i) => `${i + 1}. ${n.product_code} (${n.product_name_th || n.product_name_en}) — ${n.why.join(', ')}`).join('\n');
    return { intent: 'recommend', answer: `แนะนำ: ${top.product_code} — ${top.why.join(', ')}\nตัวเลือกอื่น:\n${lines}`, data: next, sources: ['production_db'] };
  }

  // 8) campaign
  if (/campaign|แคมเปญ/.test(q)) {
    const d = initDb();
    const camps = d.prepare('SELECT * FROM campaigns ORDER BY id DESC LIMIT 5').all();
    if (!camps.length) return { intent: 'campaign', answer: 'ยังไม่มี campaign (สร้างได้ที่ /api/campaigns)', data: [], sources: ['production_db'] };
    const p = campaignProgress(camps[0].id);
    return { intent: 'campaign', answer: `Campaign ล่าสุด "${p.campaign.campaign_name}": ทำแล้ว ${p.done}/${p.total} สินค้า`, data: p, sources: ['production_db'] };
  }

  // 9) dashboard / overview
  if (/สรุป|ภาพรวม|ทั้งหมด|dashboard|เท่าไร|กี่/.test(q)) {
    const d = getDashboard();
    const s = d.jobs_by_status;
    return {
      intent: 'dashboard',
      answer: `สินค้าทั้งหมด ${d.products_total} | ยังไม่ทำ ${d.products_untouched} | มี job แล้ว ${d.products_involved}\nJobs: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(', ') || 'ยังไม่มี'}`,
      data: d, sources: ['production_db']
    };
  }

  return {
    intent: 'help',
    answer: 'ถามได้เช่น:\n- "04-60610L ทำถึงไหนแล้ว" / "04-60610L เคยทำ V04 หรือยัง"\n- "V04 ทำไปแล้วกี่สินค้า"\n- "ตัวไหนยังไม่ทำ" / "วันนี้ควรทำตัวไหนต่อ"\n- "มีอะไร QC ไม่ผ่านบ้าง"\n- "ตัวไหน FB แล้วแต่ TikTok ยัง"\n- "วันนี้ทำอะไรไปแล้วบ้าง" / "สรุปภาพรวม"',
    sources: []
  };
}
