/* ============================================================
   领航 · 宁商巡演出海营销助手 · 前端运行时
   流程：出海体检 → 巡演匹配 → 物料工坊 → 市场锦囊 → 问领航
   密钥只放服务端；这里只调自己的 /api/*，带访问码与重试。
   ============================================================ */
(function () {
'use strict';

/* ---------------- 1. 工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

let toastTimer = 0;
function toast(msg, ms = 2800) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------------- 2. 宁商巡演站点库（示例排期，正式团期以寰亚数据通知为准） ---------------- */
const STOPS = [
  { id: 'de-hannover', country: '德国', city: '汉诺威', theme: '汉诺威工业展随团参展', month: '4 月', days: 8, scene: '工业展展位 + 一对一采购对接', fit: ['智能制造', '工业装备', '自动化', '零部件'], resources: '随团展位、现场翻译、德方采购商对接表' },
  { id: 'de-stuttgart', country: '德国', city: '斯图加特', theme: '汽车产业链对接会', month: '5 月', days: 6, scene: '走进整车与零部件供应链，闭门对接会', fit: ['汽车零部件', '精密制造', '新材料'], resources: '巴符州产业联盟、一级供应商名录' },
  { id: 'ae-dubai', country: '阿联酋', city: '迪拜', theme: '中东建材与消费品展', month: '11 月', days: 7, scene: '展会展位 + 中东经销商招募', fit: ['建材', '家居', '消费电子', '小家电'], resources: '海湾经销商联盟、转口贸易服务商' },
  { id: 'sa-riyadh', country: '沙特', city: '利雅得', theme: '智慧城市与新能源考察', month: '3 月', days: 6, scene: '政企对接、园区考察', fit: ['数字政务', '智慧交通', '新能源', '光伏储能'], resources: '特区招商局、中资商会' },
  { id: 'sg-singapore', country: '新加坡', city: '新加坡', theme: '东南亚品牌出海对接会', month: '7 月', days: 5, scene: '品牌对接 + 渠道商闭门会', fit: ['消费品牌', '跨境电商', '软件服务', '食品饮料'], resources: '东南亚电商平台、连锁渠道商' },
  { id: 'my-kl', country: '马来西亚', city: '吉隆坡', theme: '清真认证与食品渠道考察', month: '9 月', days: 5, scene: '认证机构对接 + 商超渠道走访', fit: ['食品饮料', '日化', '保健品'], resources: '清真认证咨询、商超采购对接' },
  { id: 'jp-tokyo', country: '日本', city: '东京', theme: '便利店供应链对接', month: '2 月', days: 5, scene: '商超与便利店供应链闭门对接', fit: ['食品饮料', '日用消费品', '包装'], resources: '便利店总部采购、综合商社引荐' },
  { id: 'mx-cdmx', country: '墨西哥', city: '墨西哥城', theme: '北美近岸制造考察', month: '6 月', days: 7, scene: '园区考察 + 北美供应链政策解读', fit: ['汽车零部件', '家电', '电子代工'], resources: '北美供应链服务商、园区招商对接' },
];
const stopById = (id) => STOPS.find((s) => s.id === id) || null;

/* ---------------- 3. 状态 ---------------- */
const STATE_KEY = 'linghang-state-v1';
let state = {
  profile: null,      // 表单画像
  diagnosis: null,    // 体检结果
  picks: null,        // 巡演匹配结果
  selectedStopId: null,
  materials: null,    // 物料包
  materialsStopId: null,
  insights: null,     // 市场锦囊
  insightsCountry: null,
  chat: [],           // [{role, content}]
};
function loadState() {
  const raw = lsGet(STATE_KEY);
  if (!raw) return;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object') state = { ...state, ...v };
  } catch { /* 损坏就重开 */ }
}
function saveState() {
  const s = { ...state };
  if (Array.isArray(s.chat) && s.chat.length > 30) s.chat = s.chat.slice(-30);
  lsSet(STATE_KEY, JSON.stringify(s));
}

/* ---------------- 4. 访问码门禁 ---------------- */
const DOOR_KEY = 'linghang-door-code';
function accessHeaders() {
  const code = lsGet(DOOR_KEY) || '';
  return code ? { 'x-access-code': code } : {};
}
function showDoor(err) {
  $('#main').hidden = true;
  const d = $('#door');
  d.hidden = false;
  const e = $('#door-err');
  if (err) { e.textContent = err; e.hidden = false; }
  $('#door-code').focus();
}
function initDoor() {
  $('#door-go').addEventListener('click', submitDoor);
  $('#door-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitDoor(); });
}
async function submitDoor() {
  const code = ($('#door-code').value || '').trim();
  if (!code) return;
  lsSet(DOOR_KEY, code);
  const btn = $('#door-go');
  btn.disabled = true; btn.textContent = '核对中…';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': code },
      body: JSON.stringify({ messages: [], stream: false }),
    });
    if (res.status === 401) {
      $('#door-err').textContent = '访问码不对，再试一次';
      $('#door-err').hidden = false;
      return;
    }
    // 只要不是 401 就放行关门（码本身对不对，各接口会再校验）
    $('#door').hidden = true;
  } catch {
    // 网络不通也放行——进屋后各接口的重试会给出明确报错
    $('#door').hidden = true;
  } finally {
    btn.disabled = false; btn.textContent = '上船';
  }
}

/* ---------------- 5. API 封装：带重试，504/网络类错误换新请求 ---------------- */
function retryable(e) {
  const m = String((e && e.message) || e || '');
  return /504|502|503|超时|timeout|timed out|Failed to fetch|NetworkError|AbortError|aborted|网关|Gateway/i.test(m);
}
async function apiPost(path, body, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...accessHeaders() },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        showDoor('访问码失效，请重新输入');
        throw new Error('访问码失效');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error === 'missing_api_key' ? '服务端还没配模型密钥（LLM_API_KEY）'
          : data.error === 'upstream_error' ? ('模型网关故障：' + (data.detail || '').slice(0, 80) || '上游错误')
          : ('请求失败 (' + res.status + ')');
        throw new Error(msg);
      }
      return data;
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes('访问码')) throw e;
      if (!retryable(e) || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

/* ---------------- 6. 标签页 ---------------- */
function switchTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.pane').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
  refreshGuards();
  if (name === 'chat') { const log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight; }
}
function refreshGuards() {
  const hasProfile = !!state.profile;
  if ($('#match-guard')) $('#match-guard').hidden = hasProfile;
  if ($('#match-body')) $('#match-body').hidden = !hasProfile;
  if ($('#mat-guard')) $('#mat-guard').hidden = hasProfile;
  if ($('#mat-body')) $('#mat-body').hidden = !hasProfile;
}

/* ---------------- 7. 企业画像表单 ---------------- */
function fillForm() {
  const p = state.profile || {};
  $('#f-name').value = p.name || '';
  $('#f-industry').value = p.industry || '智能制造';
  $('#f-product').value = p.product || '';
  $('#f-size').value = p.size || '中小（20-200 人）';
  $('#f-revenue').value = p.revenue || '500 万 - 2000 万';
  $('#f-exp').value = p.experience || '还没有';
  $('#f-lang').value = p.lang || '一般';
  $('#f-market').value = p.market || '';
  $$('#f-certs button').forEach((b) => b.classList.toggle('on', !!(p.certs || []).includes(b.dataset.v)));
}
function readProfile() {
  return {
    name: $('#f-name').value.trim(),
    industry: $('#f-industry').value,
    product: $('#f-product').value.trim(),
    size: $('#f-size').value,
    revenue: $('#f-revenue').value,
    experience: $('#f-exp').value,
    lang: $('#f-lang').value,
    certs: $$('#f-certs button.on').map((b) => b.dataset.v).filter((v) => v !== '无'),
    market: $('#f-market').value.trim(),
  };
}
function initForm() {
  $$('#f-certs button').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.v;
    if (v === '无') {
      const on = b.classList.contains('on');
      $$('#f-certs button').forEach((x) => x.classList.remove('on'));
      if (!on) b.classList.add('on');
      return;
    }
    b.classList.toggle('on');
    const none = $$('#f-certs button[data-v="无"]')[0];
    if (none) none.classList.remove('on');
  }));
  $('#btn-diagnose').addEventListener('click', runDiagnose);
  $$('.jump-diagnose').forEach((b) => b.addEventListener('click', () => switchTab('diagnose')));
}

/* ---------------- 8. 出海体检 ---------------- */
async function runDiagnose() {
  const profile = readProfile();
  if (!profile.name && !profile.product) { toast('先填企业名称或主营产品，体检才有依据'); return; }
  const btn = $('#btn-diagnose');
  btn.disabled = true; btn.textContent = '体检中…';
  try {
    const r = await apiPost('/api/diagnose', { profile });
    state.profile = profile;
    state.diagnosis = r.data;
    saveState();
    renderDiagnosis(r.data);
    refreshGuards();
    toast('体检完成，总分 ' + (r.data && r.data.score != null ? r.data.score : '—'));
  } catch (e) {
    toast('体检没成：' + e.message, 4200);
  } finally {
    btn.disabled = false; btn.textContent = '开始体检';
  }
}
function grade(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return { color: 'var(--muted)', word: '—' };
  if (n >= 80) return { color: 'var(--ok)', word: '准备充分' };
  if (n >= 60) return { color: 'var(--warn)', word: '基本可行' };
  return { color: 'var(--bad)', word: '需要补课' };
}
function gaugeSVG(score) {
  const n = Math.max(0, Math.min(100, Number(score) || 0));
  const R = 46, C = 2 * Math.PI * R;
  const g = grade(n);
  return '<svg width="108" height="108" viewBox="0 0 108 108">'
    + '<circle cx="54" cy="54" r="' + R + '" fill="none" stroke="#e8f0f8" stroke-width="9"/>'
    + '<circle cx="54" cy="54" r="' + R + '" fill="none" stroke="' + g.color + '" stroke-width="9" stroke-linecap="round" '
    + 'stroke-dasharray="' + (C * n / 100).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>';
}
function renderDiagnosis(d) {
  if (!d) return;
  const el = $('#diagnosis-result');
  const g = grade(d.score);
  const dims = Array.isArray(d.dims) ? d.dims : [];
  const gaps = Array.isArray(d.gaps) ? d.gaps : [];
  const acts = Array.isArray(d.actions) ? d.actions : [];
  const mkts = Array.isArray(d.markets) ? d.markets : [];
  el.innerHTML = '<div class="card">'
    + '<h2>体检报告</h2>'
    + '<div class="score-card">'
    +   '<div class="gauge">' + gaugeSVG(d.score)
    +     '<div class="gauge-num"><b style="color:' + g.color + '">' + esc(d.score != null ? d.score : '—') + '</b><span>' + esc(g.word) + '</span></div>'
    +   '</div>'
    +   '<div class="score-side"><p class="verdict">' + esc(d.verdict || '') + '</p>'
    +   '<p class="score-sub">由「领航」按企业画像估分，供出海准备参考</p></div>'
    + '</div>'
    + (dims.length ? '<div class="dims">' + dims.map((x) =>
        '<div class="dim"><span>' + esc(x.name || '') + '</span>'
        + '<span class="dim-bar"><i style="width:' + Math.max(0, Math.min(100, Number(x.score) || 0)) + '%"></i></span>'
        + '<b>' + esc(x.score != null ? x.score : '—') + '</b>'
        + (x.comment ? '<p class="dim-note">' + esc(x.comment) + '</p>' : '')
        + '</div>').join('') + '</div>' : '')
    + (gaps.length ? '<div class="list-block"><h3>最卡出海的短板</h3>'
        + gaps.map((t, i) => '<div class="li"><span class="ic">' + (i + 1) + '.</span><span>' + esc(t) + '</span></div>').join('') + '</div>' : '')
    + (acts.length ? '<div class="list-block"><h3>行动清单</h3>'
        + acts.map((a) => '<div class="action-card"><b>' + esc(a.within || '') + '</b><p>' + esc(a.do || a.action || '') + '</p></div>').join('') + '</div>' : '')
    + (mkts.length ? '<div class="list-block"><h3>推荐先去的市场</h3>'
        + mkts.map((m) => '<div class="market-row"><b>' + esc(m.country || '') + '</b><span>' + esc(m.reason || '') + '</span></div>').join('') + '</div>' : '')
    + '<div class="row-end"><button class="btn btn-ghost" id="btn-go-match" type="button">带着体检结果去匹配巡演 →</button></div>'
    + '</div>';
  const go = $('#btn-go-match');
  if (go) go.addEventListener('click', () => switchTab('match'));
}

/* ---------------- 9. 巡演匹配 ---------------- */
function stopTag(s) { return esc(s.country) + ' · ' + esc(s.city); }
function renderStops() {
  const el = $('#stops-list');
  el.innerHTML = STOPS.map((s) => {
    const picked = state.selectedStopId === s.id;
    return '<div class="stop' + (picked ? ' picked' : '') + '" data-id="' + esc(s.id) + '">'
      + '<div class="stop-top"><b>' + stopTag(s) + '｜' + esc(s.theme) + '</b>'
      + '<span class="stop-tag">' + esc(s.month) + ' · 约' + esc(s.days) + '天</span></div>'
      + '<p class="stop-meta">' + esc(s.scene) + ' ｜ 适合：' + esc((s.fit || []).join('、')) + '</p>'
      + '<p class="stop-res"><b>本站对接资源：</b>' + esc(s.resources) + '</p>'
      + '</div>';
  }).join('');
  $$('#stops-list .stop').forEach((elx) => elx.addEventListener('click', () => {
    selectStop(elx.dataset.id);
  }));
}
function renderPicks(d) {
  const el = $('#picks-result');
  const picks = Array.isArray(d && d.picks) ? d.picks : [];
  if (!picks.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card"><h2>领航的匹配结果</h2>'
    + picks.map((p) => {
      const s = stopById(p.stop_id) || { country: '未知', city: '', theme: '', month: '', days: '', scene: '' };
      const fitN = Math.max(0, Math.min(100, Number(p.fit) || 0));
      return '<div class="pick">'
        + '<div class="pick-top"><b>' + stopTag(s) + '｜' + esc(s.theme) + '</b>'
        + '<span class="fit"><span class="fit-bar"><i style="width:' + fitN + '%"></i></span><span class="fit-num">' + fitN + '</span></span></div>'
        + (s.month ? '<p class="stop-meta">' + esc(s.month) + ' · 约' + esc(s.days) + '天 · ' + esc(s.scene) + '</p>' : '')
        + '<p class="pick-reason">' + esc(p.reason || '') + '</p>'
        + (p.advice ? '<p class="pick-advice"><b>在这站要拿到：</b>' + esc(p.advice) + '</p>' : '')
        + '<div class="pick-foot"><button class="btn btn-ghost pick-btn" data-id="' + esc(s.id || '') + '" type="button">选这一站，去做物料 →</button></div>'
        + '</div>';
    }).join('')
    + (d.strategy ? '<h3>整体节奏建议</h3><div class="strategy">' + esc(d.strategy) + '</div>' : '')
    + '</div>';
  $$('.pick-btn').forEach((b) => b.addEventListener('click', () => {
    selectStop(b.dataset.id);
    switchTab('materials');
  }));
}
function selectStop(id) {
  if (!stopById(id)) return;
  state.selectedStopId = id;
  saveState();
  renderStops();
  const sel = $('#mat-stop');
  if (sel) sel.value = id;
  toast('已选 ' + stopById(id).country + ' · ' + stopById(id).city);
}
async function runMatch() {
  if (!state.profile) { switchTab('diagnose'); return; }
  const btn = $('#btn-match');
  btn.disabled = true; btn.textContent = '匹配中…';
  try {
    const r = await apiPost('/api/match', {
      profile: state.profile,
      profile_summary: (state.diagnosis && state.diagnosis.profile_summary) || '',
      stops: STOPS,
    });
    state.picks = r.data;
    saveState();
    renderPicks(r.data);
  } catch (e) {
    toast('匹配没成：' + e.message, 4200);
  } finally {
    btn.disabled = false; btn.textContent = '智能匹配';
  }
}

/* ---------------- 10. 物料工坊 ---------------- */
function fillStopSelect() {
  const sel = $('#mat-stop');
  sel.innerHTML = STOPS.map((s) => '<option value="' + esc(s.id) + '">' + stopTag(s) + '｜' + esc(s.theme) + '（' + esc(s.month) + '）</option>').join('');
  sel.value = state.selectedStopId || STOPS[0].id;
}
function matSection(title, inner, copyText) {
  return '<div class="mat-block"><div class="mat-head"><b>' + esc(title) + '</b>'
    + '<button class="btn-mini mat-copy" type="button">复制</button></div>'
    + '<div class="mat-body">' + inner + '</div></div>';
}
function renderMaterials(d) {
  if (!d) return;
  const el = $('#materials-result');
  const blocks = [];
  if (d.tagline) blocks.push(matSection('英文 Slogan', esc(d.tagline), d.tagline));
  if (d.profile_en) blocks.push('<div class="mat-block"><div class="mat-head"><b>① 一页纸英文公司简介</b><button class="btn-mini mat-copy" type="button">复制</button></div><div class="mat-body en">' + esc(d.profile_en) + '</div></div>');
  if (d.pitch_zh || d.pitch_en) {
    const bodyText = (d.pitch_en || '') + (d.pitch_en && d.pitch_zh ? '\n\n—— 中文对照 ——\n' : '') + (d.pitch_zh || '');
    blocks.push('<div class="mat-block"><div class="mat-head"><b>② 30 秒电梯 Pitch</b><button class="btn-mini mat-copy" type="button">复制</button></div>'
      + '<div class="mat-body">' + esc(bodyText) + '</div>'
      + (Array.isArray(d.pitch_notes) && d.pitch_notes.length
        ? '<p class="fine">现场提示：' + esc(d.pitch_notes.join('；')) + '</p>' : '')
      + '</div>');
  }
  const faqs = Array.isArray(d.faqs) ? d.faqs : [];
  if (faqs.length) {
    const bodyText = faqs.map((f, i) => 'Q' + (i + 1) + '. ' + (f.q_en || '') + '\n答（参考）：' + (f.a_zh || '') + (f.a_en ? '\n' + f.a_en : '')).join('\n\n');
    blocks.push('<div class="mat-block"><div class="mat-head"><b>③ 展台高频问答（5 问）</b><button class="btn-mini mat-copy" type="button">复制</button></div><div class="mat-body en">'
      + faqs.map((f, i) => '<p class="faq-q">Q' + (i + 1) + '. ' + esc(f.q_en || '') + '</p>'
        + '<p class="faq-a">' + esc(f.a_zh || '') + '</p>'
        + (f.a_en ? '<p class="faq-a en">' + esc(f.a_en) + '</p>' : '')).join('')
      + '</div></div>');
  }
  const sns = Array.isArray(d.social) ? d.social : [];
  if (sns.length) {
    blocks.push('<div class="mat-block"><div class="mat-head"><b>④ 展前 · 展中 · 展后 社媒文案</b><button class="btn-mini mat-copy" type="button">复制</button></div><div class="mat-body">'
      + sns.map((s) => '<span class="sns-phase">' + esc(s.phase || '') + '</span>'
        + (s.text_en ? '<p class="faq-a en">' + esc(s.text_en) + '</p>' : '')
        + (s.text_zh ? '<p class="faq-a">' + esc(s.text_zh) + '</p>' : '')).join('')
      + '</div></div>');
  }
  el.innerHTML = blocks.length
    ? '<div class="card"><div class="mat-head"><h2>路演物料包</h2><button id="btn-dl" class="btn btn-ghost" type="button">下载物料包 .md</button></div>' + blocks.join('') + '<p class="fine">物料由 AI 生成，用之前把数字和事实核一遍；正式报名材料以寰亚数据通知为准。</p></div>'
    : '<div class="empty"><p>物料包是空的，再生成一次试试。</p></div>';
  $$('.mat-copy').forEach((b) => b.addEventListener('click', () => {
    const bodyEl = b.closest('.mat-block').querySelector('.mat-body');
    copyText(b.textContent, bodyEl ? bodyEl.textContent : '');
  }));
  const dl = $('#btn-dl');
  if (dl) dl.addEventListener('click', () => downloadMaterials(d));
}
function copyText(label, text) {
  const done = () => toast('已复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('复制失败，请手动选择'); }
  document.body.removeChild(ta);
}
function downloadMaterials(d) {
  const stop = stopById(state.materialsStopId || state.selectedStopId) || { country: '', city: '', theme: '' };
  const L = [];
  L.push('# 宁商巡演路演物料包');
  L.push('> ' + (state.profile && state.profile.name ? state.profile.name : '') + ' ｜ ' + stop.country + ' · ' + stop.city + '（' + stop.theme + '）');
  L.push('> 由「领航」生成 · 运营方：寰亚数据 · 宁商巡演项目组');
  if (d.tagline) L.push('\n## 英文 Slogan\n' + d.tagline);
  if (d.profile_en) L.push('\n## 一页纸英文公司简介\n' + d.profile_en);
  if (d.pitch_zh || d.pitch_en) {
    L.push('\n## 30 秒电梯 Pitch');
    if (d.pitch_en) L.push('（英文）\n' + d.pitch_en);
    if (d.pitch_zh) L.push('（中文）\n' + d.pitch_zh);
    if (Array.isArray(d.pitch_notes) && d.pitch_notes.length) L.push('现场提示：' + d.pitch_notes.join('；'));
  }
  if (Array.isArray(d.faqs) && d.faqs.length) {
    L.push('\n## 展台高频问答');
    d.faqs.forEach((f, i) => L.push('**Q' + (i + 1) + '. ' + (f.q_en || '') + '**\n- 参考（中）：' + (f.a_zh || '') + '\n- 参考（英）：' + (f.a_en || '')));
  }
  if (Array.isArray(d.social) && d.social.length) {
    L.push('\n## 展前 · 展中 · 展后 社媒文案');
    d.social.forEach((s) => L.push('**[' + (s.phase || '') + ']**\n- 英文：' + (s.text_en || '') + '\n- 中文：' + (s.text_zh || '')));
  }
  const blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '路演物料包-' + (state.profile && state.profile.name ? state.profile.name.slice(0, 20) : '宁商巡演') + '.md';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 400);
}
async function runMaterials() {
  if (!state.profile) { switchTab('diagnose'); return; }
  const stopId = $('#mat-stop').value;
  const stop = stopById(stopId);
  const btn = $('#btn-materials');
  const st = $('#mat-status');
  btn.disabled = true; btn.textContent = '生成中…';
  st.hidden = false; st.textContent = '两路并发生成：身份类物料 + 话术类物料，约需十几秒…';
  try {
    const r = await apiPost('/api/materials', {
      profile: state.profile,
      profile_summary: (state.diagnosis && state.diagnosis.profile_summary) || '',
      stop,
    });
    state.materials = r.data;
    state.materialsStopId = stopId;
    saveState();
    st.hidden = true;
    renderMaterials(r.data);
    toast('物料包生成完成');
  } catch (e) {
    st.hidden = true;
    toast('物料没成：' + e.message, 4200);
  } finally {
    btn.disabled = false; btn.textContent = '生成物料包';
  }
}

/* ---------------- 11. 市场锦囊 ---------------- */
function insCountries() {
  const el = $('#ins-countries');
  const countries = Array.from(new Set(STOPS.map((s) => s.country)));
  if (state.insightsCountry && !countries.includes(state.insightsCountry)) countries.push(state.insightsCountry);
  el.innerHTML = countries.map((c) => '<button type="button" data-v="' + esc(c) + '" class="' + (state.insightsCountry === c ? 'on' : '') + '">' + esc(c) + '</button>').join('');
  $$('#ins-countries button').forEach((b) => b.addEventListener('click', () => {
    state.insightsCountry = b.dataset.v;
    saveState();
    $$('#ins-countries button').forEach((x) => x.classList.toggle('on', x.dataset.v === b.dataset.v));
  }));
}
function liList(arr, icons) {
  return (Array.isArray(arr) ? arr : []).map((t, i) =>
    '<div class="li"><span class="ic">' + (icons ? (icons[i % icons.length]) : (i + 1) + '.') + '</span><span>' + esc(t) + '</span></div>').join('');
}
function renderInsights(d, country) {
  if (!d) return;
  const el = $('#insights-result');
  const comps = Array.isArray(d.compliance) ? d.compliance : [];
  el.innerHTML = '<div class="card"><h2>' + esc(country) + ' · 市场锦囊</h2>'
    + '<div class="ins-grid">'
    + '<div class="ins-box"><h3>🤝 商务礼仪</h3>' + liList(d.etiquette, ['·']) + '</div>'
    + '<div class="ins-box"><h3>⚠️ 别踩的坑</h3>' + liList(d.taboos, ['·']) + '</div>'
    + (comps.length ? '<div class="ins-box ins-wide"><h3>📋 准入与认证</h3>'
        + comps.map((c) => '<div class="li"><span class="ic">·</span><span><span class="comp-name">' + esc(c.name || '') + '</span>' + (c.note ? ' —— ' + esc(c.note) : '') + '</span></div>').join('') + '</div>' : '')
    + '<div class="ins-box"><h3>🛒 渠道打法</h3>' + liList(d.channels, ['·']) + '</div>'
    + '<div class="ins-box"><h3>💰 收款与定价</h3>'
        + (d.payments ? '<p class="ins-text"><b>收款：</b>' + esc(d.payments) + '</p>' : '')
        + (d.pricing ? '<p class="ins-text" style="margin-top:6px"><b>定价：</b>' + esc(d.pricing) + '</p>' : '')
        + '</div>'
    + (d.resources ? '<div class="ins-box ins-wide"><h3>⛵ 借宁商巡演拿资源</h3><p class="ins-text">' + esc(d.resources) + '</p></div>' : '')
    + '</div>'
    + '<p class="fine">情报由 AI 按通行商业常识生成，具体法规与认证要求以官方渠道为准。</p>'
    + '</div>';
}
async function runInsights() {
  const country = state.insightsCountry;
  if (!country) { toast('先选一个目标市场'); return; }
  const btn = $('#btn-insights');
  btn.disabled = true; btn.textContent = '生成中…';
  try {
    const r = await apiPost('/api/insights', {
      country,
      industry: (state.profile && state.profile.industry) || '',
      stop: stopById(STOPS.find((s) => s.country === country)?.id || ''),
    });
    state.insights = r.data;
    state.insightsCountry = country;
    saveState();
    renderInsights(r.data, country);
  } catch (e) {
    toast('锦囊没成：' + e.message, 4200);
  } finally {
    btn.disabled = false; btn.textContent = '生成锦囊';
  }
}

/* ---------------- 12. 问领航（流式） ---------------- */
function chatSystem() {
  const p = state.profile;
  const lines = [
    '你是「领航」，宁商巡演项目组（运营方：寰亚数据）的企业出海营销助手，服务南京市鼓楼区企业，帮他们通过海外路演走向国际市场。',
    '回答要具体、可落地、面向企业主，全部中文。涉及正式排期和报名时，提醒以寰亚数据正式通知为准。',
  ];
  if (p) {
    lines.push('【当前企业画像】' + [
      '名称：' + (p.name || '未填'), '行业：' + (p.industry || '未填'),
      '产品：' + (p.product || '未填'), '规模：' + (p.size || ''),
      '出海经验：' + (p.experience || ''), '外语能力：' + (p.lang || ''),
    ].join('；'));
  }
  if (state.diagnosis && state.diagnosis.profile_summary) lines.push('【体检摘要】' + state.diagnosis.profile_summary);
  const stop = stopById(state.selectedStopId);
  if (stop) lines.push('【所选路演站点】' + stop.country + ' · ' + stop.city + '，' + stop.theme + '（' + stop.month + '）');
  return lines.join('\n');
}
function renderChat() {
  const log = $('#chat-log');
  if (!state.chat.length) {
    log.innerHTML = '<div class="bubble bot">我是领航 ⛵ 你的企业画像和所选站点我都记着，直接问：第一次参展该带几个人？物料怎么准备？这个市场水有多深？</div>';
    return;
  }
  log.innerHTML = state.chat.map((m) => '<div class="bubble ' + (m.role === 'user' ? 'user' : 'bot') + '">' + esc(m.content) + '</div>').join('');
  log.scrollTop = log.scrollHeight;
}
async function sendChat() {
  const input = $('#chat-input');
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  state.chat.push({ role: 'user', content: text });
  saveState();
  renderChat();

  const log = $('#chat-log');
  const loading = document.createElement('div');
  loading.className = 'bubble bot loading';
  loading.textContent = '领航在想…';
  log.appendChild(loading);
  log.scrollTop = log.scrollHeight;

  const send = $('#chat-send');
  send.disabled = true;
  let reply = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...accessHeaders() },
      body: JSON.stringify({
        messages: [{ role: 'system', content: chatSystem() }, ...state.chat.slice(-8)],
        max_tokens: 1400,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error === 'missing_api_key' ? '服务端还没配模型密钥' : '请求失败 (' + res.status + ')');
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const payload = line.slice(6);
        if (payload.trim() === '[DONE]') continue;
        const j = JSON.parse(payload);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) {
          reply += delta;
          loading.textContent = reply;
          log.scrollTop = log.scrollHeight;
        }
      }
    }
    if (!reply.trim()) reply = '（模型没返回内容，再问一次试试）';
  } catch (e) {
    reply = '出了点问题：' + e.message + '。再发一次试试。';
  } finally {
    send.disabled = false;
  }
  state.chat.push({ role: 'assistant', content: reply });
  saveState();
  renderChat();
}

/* ---------------- 13. 启动 ---------------- */
function boot() {
  loadState();
  fillForm();
  fillStopSelect();
  renderStops();
  if (state.diagnosis) renderDiagnosis(state.diagnosis);
  if (state.picks) renderPicks(state.picks);
  if (state.materials) renderMaterials(state.materials);
  insCountries();
  if (state.insights) renderInsights(state.insights, state.insightsCountry || (STOPS[0] && STOPS[0].country));
  renderChat();

  $$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#btn-match').addEventListener('click', runMatch);
  $('#btn-materials').addEventListener('click', runMaterials);
  $('#btn-insights').addEventListener('click', runInsights);
  $('#chat-send').addEventListener('click', sendChat);
  $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  refreshGuards();
}
function init() {
  initDoor();
  // 页面正常打开；配了访问码的站，接口层 401 时会弹回敲门层
  $('#main').hidden = false;
  boot();
}
init();
})();
