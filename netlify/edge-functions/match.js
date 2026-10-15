// POST /api/match —— 巡演匹配：企业画像 + 宁商巡演站点库 → 最匹配的 3 站 + 理由 + 建议
// 站点库由前端随请求带来（单一数据源在前端，寰亚数据正式排期出来后只改前端一处）。
import { gate, json, callJSON, ascii } from './_llm.js';

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const denied = gate(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const profile = body && body.profile ? body.profile : {};
  const stops = Array.isArray(body && body.stops) ? body.stops : [];
  if (!stops.length) return json({ error: 'no_stops' }, 400);

  const S = (x) => String(x || '').slice(0, 300);
  const profileText = [
    '企业名称：' + (S(profile.name) || '（未填）'),
    '所在行业：' + (S(profile.industry) || '（未填）'),
    '主营产品/服务：' + (S(profile.product) || '（未填）'),
    '企业规模：' + (S(profile.size) || '（未填）'),
    '出海经验：' + (S(profile.experience) || '（未填）'),
    '意向市场：' + (S(profile.market) || '（未填，帮我推荐）'),
    '体检画像摘要：' + (S(body.profile_summary) || '（无）'),
  ].join('\n');

  const stopsText = stops.map((s) => [
    'stop_id: ' + S(s.id),
    '站点: ' + S(s.country) + ' · ' + S(s.city),
    '主题: ' + S(s.theme),
    '月份: ' + S(s.month) + '，团期约 ' + S(s.days) + ' 天',
    '场景: ' + S(s.scene),
    '适合行业: ' + (Array.isArray(s.fit) ? s.fit.join('、') : S(s.fit)),
    '对接资源: ' + S(s.resources),
  ].join('  |  ')).join('\n---\n');

  const system = [
    '你是「领航」，宁商巡演项目组（运营方：寰亚数据）的企业出海营销顾问，服务南京市鼓楼区企业。',
    '宁商巡演是寰亚数据中标运营的出海路演项目，组织鼓楼企业分批赴海外参加展会、产业对接会和考察。',
    '你的任务：把一家企业和宁商巡演的站点库做匹配，选出最匹配的 3 个站点。要求：',
    '- 只能从给定站点里选，stop_id 原样抄，不要编造站点。',
    '- 匹配度客观：行业对口、场景能接触到买家/合作方、出发时间赶得上，三者综合估。',
    '- 理由具体到「这家企业在这站能见到谁、拿到什么」，不要空话。',
    '- strategy：给一段整体节奏建议（先去哪站、为什么、之后怎么走），面向企业主，中文。',
    '只输出一个 JSON 对象，不要输出任何其他文字。',
  ].join('\n');

  const user = [
    '【企业画像】',
    profileText,
    '',
    '【宁商巡演站点库】',
    stopsText,
    '',
    '【输出 JSON 结构】',
    '{',
    '  "picks": [',
    '    {"stop_id": "原样抄站点id", "fit": 0-100, "reason": "为什么匹配，能见到谁拿到什么", "advice": "在这站要拿到的具体成果"},',
    '    {"stop_id": "...", "fit": 0-100, "reason": "...", "advice": "..."},',
    '    {"stop_id": "...", "fit": 0-100, "reason": "...", "advice": "..."}',
    '  ],',
    '  "strategy": "整体出海节奏建议，80-120 字"',
    '}',
  ].join('\n');

  const r = await callJSON({ system, user, maxTokens: 1400, temperature: 0.5 });
  if (r.error) return json({ error: r.error, detail: r.detail || '', status: r.status || 0 }, 502);
  return json({ data: r.data, model: ascii(r.model) });
};

export const config = { path: '/api/match' };
