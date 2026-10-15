// POST /api/insights —— 市场锦囊：目标市场 → 礼仪/禁忌/认证合规/渠道支付/定价 + 宁商巡演本站资源
import { gate, json, callJSON, ascii } from './_llm.js';

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const denied = gate(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const country = String(body && body.country || '').slice(0, 60);
  const stop = body && body.stop ? body.stop : null;
  if (!country) return json({ error: 'no_country' }, 400);

  const S = (x) => String(x || '').slice(0, 300);
  const stopText = stop ? [
    '宁商巡演在' + S(stop.country) + '的站点：' + S(stop.country) + ' · ' + S(stop.city),
    '主题: ' + S(stop.theme) + '，场景: ' + S(stop.scene),
    '对接资源: ' + S(stop.resources),
  ].join('  |  ') : '（宁商巡演站点库中暂无该市场的站点，resources 请给企业自行对接的建议）';

  const system = [
    '你是「领航」，宁商巡演项目组（运营方：寰亚数据）的企业出海营销顾问，服务南京市鼓楼区企业。',
    '你的任务：为一个目标市场生成「市场锦囊」情报卡，帮第一次去这个市场的中国企业主避坑。要求：',
    '- 内容实用、具体、基于该市场的通行商业常识，不要编造具体法规条文编号。',
    '- 认证/合规写该市场最常见的准入认证或合规要求，各配一句「管什么用」的说明。',
    '- 语言：全部中文，面向企业主。',
    '只输出一个 JSON 对象，不要输出任何其他文字。',
  ].join('\n');

  const user = [
    '【目标市场】' + country,
    '【企业所属行业】' + (S(body.industry) || '（未填）'),
    '【宁商巡演本站情况】' + stopText,
    '',
    '【输出 JSON 结构】',
    '{',
    '  "etiquette": ["商务礼仪要点（5 条，每条一句话）"],',
    '  "taboos": ["文化/商务禁忌（4 条，每条一句话，写「别做什么」）"],',
    '  "compliance": [',
    '    {"name": "认证/合规名（如 CE、GCC、PSE 等）", "note": "管什么用，一句话"}',
    '    —— 共 3 条',
    '  ],',
    '  "channels": ["主流获客/销售渠道（3 条，每条一句话）"],',
    '  "payments": "付款习惯与收款风险提示，2 句以内",',
    '  "pricing": "定价与竞争提示，2 句以内",',
    '  "resources": "结合宁商巡演本站情况，给一段 2-3 句的联动建议（怎么借这个站点拿资源）"',
    '}',
    '注意：etiquette 5 条、taboos 4 条、compliance 3 个对象、channels 3 条，均为字符串数组（compliance 是对象数组）。只输出 JSON。',
  ].join('\n');

  const r = await callJSON({ system, user, maxTokens: 1600, temperature: 0.5 });
  if (r.error) return json({ error: r.error, detail: r.detail || '', status: r.status || 0 }, 502);
  return json({ data: r.data, model: ascii(r.model) });
};

export const config = { path: '/api/insights' };
