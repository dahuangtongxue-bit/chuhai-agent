// ============================================================================
// 领航 · Edge Functions 公共件
//
// 从招财/扑通两个项目沉淀下来的教训，全部固化在这里：
//  1. 密钥只放 Netlify 环境变量，浏览器永远拿不到（前端只调自己的 /api/*）。
//  2. 思考型模型会把正文塞进 reasoning_content、content 恒空 —— 取正文必须走
//     readContent()，只读 content 会拿到空字符串。
//  3. 思考文本里也有花括号 —— 抠 JSON 必须先剥思考段再找 { }，
//     裸正则会从思考文本里截出半截 JSON。
//  4. deepseek-v4-flash-0731 这条渠道不认 thinking:{type:'disabled'} 等参数
//     （一带就报「无效的令牌」）—— 所以这里不发关思考参数。
//  5. 主模型 5xx / 429 / 404 / 渠道挂了才切备用模型；JSON 没抠出来也换备用再试。
//  6. 响应头只能放 ASCII。
//
//  工程注：剥思考段的正则用字符串拼接构造（THINK_RE），不用正则字面量——
//  思考开闭标签是合法 HTML 注释形态，写进源码会被各种工具链误吞。
// ============================================================================

const DEFAULT_BASE = 'https://api-model.gpulink.cc/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash-0731';

const THINK_RE = new RegExp('<' + 'think' + '>[\\s\\S]*?<\\/' + 'think' + '>', 'gi');
const THINK_CLOSE_RE = new RegExp('<\\/' + 'think' + '\\s*>', 'i');

export const env = (k) => (globalThis.Netlify && Netlify.env.get(k)) || '';

// 响应头只能放 ASCII
export const ascii = (s) => String(s || '').replace(/[^\x20-\x7e]/g, '?').slice(0, 120);

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 统一的门禁：设了 ACCESS_CODE 就要求请求头带上
export function gate(request) {
  const code = env('ACCESS_CODE');
  if (code && request.headers.get('x-access-code') !== code) {
    return json({ error: 'access_code_required' }, 401);
  }
  return null;
}

export function safeJSONParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function stripThink(t) {
  let s = String(t || '').replace(THINK_RE, '');
  const ct = s.search(THINK_CLOSE_RE);            // 只有闭合标签的情况
  if (ct !== -1) s = s.slice(s.indexOf('>', ct) + 1);
  return s;
}

/** 从网关返回里取正文。思考型模型/网关会把全部输出塞进 reasoning_content，
 *  content 恒空 —— 只读 content 的话，模型明明答了，你却拿到空字符串。 */
export function readContent(data) {
  const c0 = (data && Array.isArray(data.choices) && data.choices[0]) || {};
  const direct = String((c0.message && c0.message.content) || '');
  const raw = direct.trim() ? direct : String((c0.message && c0.message.reasoning_content) || '');
  return stripThink(raw);
}

/** 从模型回复里抠出 JSON 本体：先剥思考段再找 { }（思考文本里也有花括号，
 *  裸正则会截出半截 JSON），容忍代码围栏和尾逗号。失败回 null。 */
export function pickJSON(raw) {
  const t = stripThink(raw).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  const body = t.slice(a, b + 1);
  try { return JSON.parse(body); } catch {
    try { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
  }
}

// 思考型模型（kimi-k3 等）：不认 max_tokens，要用 max_completion_tokens + reasoning_effort
export const isThinkingModel = (m) => /(^|[-_/])k3|kimi-k3|thinking|reasoner|-r1|qwq/i.test(String(m || ''));

function buildBody({ model, messages, maxTokens, temperature }) {
  const base = { model, messages, stream: false };
  if (isThinkingModel(model)) {
    return { ...base, reasoning_effort: 'low', max_completion_tokens: Math.max(Number(maxTokens) || 0, 32000) };
  }
  return { ...base, max_tokens: maxTokens, temperature };
}

/**
 * 一次「非流式」模型调用，回 JSON 数据。
 * 第 1 发主模型 → 回复里没抠出合法 JSON 或渠道挂了 → 第 2 发备用模型。
 * 返回 { data, model } 或 { error, status?, detail? }。
 */
export async function callJSON({ system, user, maxTokens = 2200, temperature = 0.6 }) {
  const key = env('LLM_API_KEY');
  if (!key) return { error: 'missing_api_key' };
  const base = (env('LLM_API_BASE') || DEFAULT_BASE).replace(/\/+$/, '');
  const models = [env('LLM_MODEL') || DEFAULT_MODEL, env('LLM_MODEL_FALLBACK')].filter(Boolean);

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  let last = '没有可用模型';
  for (const model of models) {
    let res;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify(buildBody({ model, messages, maxTokens, temperature })),
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined,
      });
    } catch (e) { last = String(e && e.message || e); continue; }
    const text = await res.text().catch(() => '');
    if (res.ok) {
      const data = safeJSONParse(text);
      const parsed = data ? pickJSON(readContent(data)) : null;
      if (parsed) return { data: parsed, model };
      last = '模型回复里没抠出合法 JSON';
      continue;
    }
    last = text.slice(0, 400);
    const retryable = res.status >= 500 || res.status === 404 || res.status === 429
      || /model_not_found|无可用渠道|not.?found/i.test(last);
    if (!retryable) return { error: 'upstream_error', status: res.status, detail: last };
  }
  return { error: 'upstream_error', detail: last };
}
