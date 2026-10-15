// POST /api/diagnose —— 出海体检：企业画像 → 准备度评分 + 短板 + 30/60/90 天行动 + 推荐市场
import { gate, json, callJSON, ascii } from './_llm.js';

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const denied = gate(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const p = body && body.profile ? body.profile : {};
  const S = (x) => String(x || '').slice(0, 300);
  const profileText = [
    '企业名称：' + (S(p.name) || '（未填）'),
    '所在行业：' + (S(p.industry) || '（未填）'),
    '主营产品/服务：' + (S(p.product) || '（未填）'),
    '企业规模：' + (S(p.size) || '（未填）'),
    '年营收区间：' + (S(p.revenue) || '（未填）'),
    '出海经验：' + (S(p.experience) || '（未填）'),
    '外语/外贸能力：' + (S(p.lang) || '（未填）'),
    '已有认证：' + (Array.isArray(p.certs) && p.certs.length ? p.certs.join('、') : '（无）'),
    '意向市场：' + (S(p.market) || '（未填，请帮我推荐）'),
  ].join('\n');

  const system = [
    '你是「领航」，宁商巡演项目组（运营方：寰亚数据）的企业出海营销顾问，服务对象是南京市鼓楼区的企业，帮助他们通过海外路演（宁商巡演）走向国际市场。',
    '你的任务：根据企业画像做出海准备度体检。要求：',
    '- 评分客观：按行业常识估，不吹不贬；五个维度分数要与总分自洽（总分约等于各维度的加权，不要明显矛盾）。',
    '- 短板具体：指向这家企业最卡出海的三件事，不要泛泛而谈。',
    '- 建议可落地：按 30/60/90 天节奏给三步，每步一句能直接执行的事。',
    '- 推荐市场：结合行业和产品给三个最值得先去的国家/地区，各配一句理由。',
    '- 语言：全部中文，面向企业主，专业但不说黑话。',
    '只输出一个 JSON 对象，不要输出任何其他文字。',
  ].join('\n');

  const user = [
    '【企业画像】',
    profileText,
    '',
    '【输出 JSON 结构】',
    '{',
    '  "score": 0-100 的整数（出海准备度总分）,',
    '  "verdict": "一句话总评，40 字以内",',
    '  "dims": [',
    '    {"name": "产品与定位", "score": 0-100, "comment": "一句点评"},',
    '    {"name": "目标市场匹配", "score": 0-100, "comment": "一句点评"},',
    '    {"name": "资质与合规", "score": 0-100, "comment": "一句点评"},',
    '    {"name": "团队能力", "score": 0-100, "comment": "一句点评"},',
    '    {"name": "营销物料", "score": 0-100, "comment": "一句点评"}',
    '  ],',
    '  "gaps": ["最卡出海的短板一", "短板二", "短板三"],',
    '  "actions": [',
    '    {"within": "30 天", "do": "具体动作"},',
    '    {"within": "60 天", "do": "具体动作"},',
    '    {"within": "90 天", "do": "具体动作"}',
    '  ],',
    '  "markets": [',
    '    {"country": "国家/地区", "reason": "一句理由"},',
    '    {"country": "国家/地区", "reason": "一句理由"},',
    '    {"country": "国家/地区", "reason": "一句理由"}',
    '  ],',
    '  "profile_summary": "把这家企业的画像浓缩成 2-3 句话，供后续巡演匹配和物料生成环节直接引用"',
    '}',
  ].join('\n');

  const r = await callJSON({ system, user, maxTokens: 1600, temperature: 0.5 });
  if (r.error) return json({ error: r.error, detail: r.detail || '', status: r.status || 0 }, 502);
  return json({ data: r.data, model: ascii(r.model) });
};

export const config = { path: '/api/diagnose' };
