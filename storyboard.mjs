// Storyboard Studio logic — prompt compiler, rule-based image QA, Flow pack.
// Rule-based QA is labeled as such; it does NOT claim vision verification.
const clean = v => String(v ?? '').trim();

export function dnaLockText(dna) {
  // dna: {code,name,category,verified:[{label,value}],fitmentText} — all from DB/sheet
  const lines = [
    'Use supplied WDI product reference as the only source of truth.',
    'Preserve exact silhouette, proportions, lens geometry, housing geometry, connector, wire count, mounting points, screws, clips, finish and visible markings.',
    'Do not redesign, mirror, recolor, beautify, merge or invent parts.'
  ];
  const v = (dna && dna.verified && dna.verified.length)
    ? dna.verified.map(f => `${f.label || ''}: ${f.value || ''}`.trim()).filter(Boolean).join(' | ')
    : '';
  if (v) lines.push('Verified facts: ' + v);
  return lines.join(' ');
}

export function buildSceneImagePrompt({ dna, scene, brief = {}, settings = {} }) {
  const parts = [
    `Product: ${dna.code || ''} ${dna.name || ''}`.trim(),
    `Scene ${scene.scene_id || ''}: ${scene.purpose || 'product showcase'}.`,
    scene.shot ? `Shot: ${scene.shot}.` : '',
    scene.camera ? `Camera: ${scene.camera}.` : 'Camera: slow controlled product move.',
    scene.environment ? `Environment: ${scene.environment}.` : '',
    scene.lighting ? `Lighting: ${scene.lighting}.` : 'Lighting: soft neutral studio.',
    scene.action ? `Action: ${scene.action}.` : '',
    brief.mood ? `Mood: ${brief.mood}.` : '',
    brief.visual_style ? `Style: ${brief.visual_style}.` : 'Style: clean premium automotive product photo.',
    `IDENTITY LOCK: ${dnaLockText(dna)}`,
    `Aspect ${settings.aspect || '1:1'}. No text, logos, QR, watermark.`
  ];
  const negative = scene.negative_prompt || 'wrong product, changed geometry, wrong lens, wrong connector, invented fitment, extra parts, fake logo, fake text, deformation, cartoon';
  return { prompt: parts.filter(Boolean).join(' '), negative };
}

export function buildSceneRefs({ dnaRefs = [], sceneRefs = [], generated = [] }) {
  // priority: DNA refs → scene refs → prior generated stills. Never substitutes.
  const out = [];
  const push = (arr, source) => (arr || []).forEach((u, i) => {
    u = clean(typeof u === 'string' ? u : (u && u.url) || '');
    if (u && !out.some(x => x.url === u)) out.push({ url: u, source, order: out.length });
  });
  push(dnaRefs, 'dna');
  push(sceneRefs, 'scene');
  push(generated, 'generated');
  return out;
}

// Rule-based image QA (NOT vision). Returns {status, checks[]}.
export function qaImage({ scene, prompt, refsCount = 0, aspect, supportedAspects = [], sizeOk = true }) {
  const checks = [];
  const pass = (name, detail) => checks.push({ name, status: 'PASS', detail: detail || '' });
  const review = (name, detail) => checks.push({ name, status: 'REVIEW', detail: detail || '' });
  const fail = (name, detail) => checks.push({ name, status: 'FAIL', detail: detail || '' });
  if (!prompt || prompt.length < 80) fail('prompt-present', 'prompt too short/empty');
  else pass('prompt-present', prompt.length + ' chars');
  if (refsCount > 0) pass('references', refsCount + ' ref(s) attached as prompt context (text-only provider: not sent as pixels)');
  else review('references', 'no reference images attached');
  if (supportedAspects.length && !supportedAspects.includes(aspect)) fail('aspect', `${aspect} not in [${supportedAspects.join(', ')}]`);
  else pass('aspect', aspect || 'default');
  if (!sizeOk) fail('size', 'unsupported size for provider');
  else pass('size', 'ok');
  if (/mirror|LH.*RH|RH.*LH/i.test(scene.purpose || '') && !/no mirror|never mirror/i.test(prompt)) review('side-safety', 'pair scene: confirm no mirroring instruction present');
  else pass('side-safety', 'ok');
  const bad = checks.some(c => c.status === 'FAIL');
  const rev = checks.some(c => c.status === 'REVIEW');
  return { kind: 'rule-based', status: bad ? 'FAIL' : rev ? 'REVIEW' : 'PASS', checks };
}

export function compileFlowPack({ storyboard, scenes, brief = {}, model }) {
  return {
    storyboard_id: storyboard.id,
    product_code: storyboard.product_code,
    model: model || storyboard.flow_model || '',
    generated_at: new Date().toISOString(),
    scenes: scenes.map(sc => {
      const gen = (sc.generations || []).find(g => g.is_current) || {};
      return {
        scene_id: sc.scene_id,
        duration: (sc.duration_secs || 10) + 's',
        purpose: sc.purpose || '',
        products: (sc.product_codes || '').split(',').map(s => s.trim()).filter(Boolean),
        prompt: gen.prompt || '',
        negative_prompt: gen.negative_prompt || '',
        references: sc.refs || [],
        image: gen.assets && gen.assets[0] ? gen.assets[0].path : '',
        continuity: sc.continuity || '',
        start_state: sc.start_state || '',
        end_state: sc.end_state || ''
      };
    })
  };
}
