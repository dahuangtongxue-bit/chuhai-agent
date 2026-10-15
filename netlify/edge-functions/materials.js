// POST /api/materials —— 物料工坊：企业画像 + 所选站点 → 路演物料包
//
// 工程决策：拆成两个独立调用并行发（身份类 + 话术类），而不是一次生成四块。
// 原因：一次生成输出太长，容易撞网关时长上限；两个并行调用各自短小，
// 总耗时约等于最慢的那一个，还更快。任何一边失败都整包报错（不交付半包）。
import { gate, json, callJSON, ascii } from './_llm.js';

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const denied = gate(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const profile = body && body.profile ? body.profile : {};
  const stop = body && body.stop ? body.stop : {};
  const S = (x) => String(x || '').slice(0, 300);

  const profileText = [
    '企业名称：' + (S(profile.name) || '（未填）'),
    '所在行业：' + (S(profile.industry) || '（未填）'),
    '主营产品/服务：' + (S(profile.product) || '（未填）'),
    '企业规模：' + (S(profile.size) || '（未填）'),
    '出海经验：' + (S(profile.experience) || '（未填）'),
    '外语/外贸能力：' + (S(profile.lang) || '（未填）'),
  ].join('\n');
  const stopText = [
    '站点: ' + (S(stop.country) || '（未选）') + ' · ' + S(stop.city),
    '主题: ' + S(stop.theme),
    '月份: ' + S(stop.month),
    '场景: ' + S(stop.scene),
  ].join('  |  ');
  const summaryText = S(body.profile_summary) || '（无体检摘要）';

  const sysBase = [
    '你是「领航」，宁商巡演项目组（运营方：寰亚数据）的企业出海营销顾问，服务南京市鼓楼区企业。',
    '企业即将随宁商巡演赴海外路演，你要为它生成路演物料。物料要能直接用：具体、口语、有数字概念，不写空话套话。',
    '只输出一个 JSON 对象，不要输出任何其他文字。',
  ].join('\n');

  const callA = callJSON({
    system: sysBase,
    user: [
      '【企业画像】', profileText, '【体检摘要】', summaryText, '【路演站点】', stopText, '',
      '【任务】生成企业的「身份类」物料。',
      '【输出 JSON 结构】',
      '{',
      '  "tagline": "一句英文 slogan（10 词以内，朗朗上口）",',
      '  "profile_en": "一页纸英文公司简介，180-220 词，含：公司定位、主营产品/服务、核心优势（给 2-3 个具体卖点）、目标客户、合作邀请（邀请对方在展会现场洽谈）。段落式，不要用 markdown 标题符号",',
      '  "pitch_zh": "30 秒电梯 pitch 中文版，120 字以内，口语化，先勾住人再讲产品",',
      '  "pitch_en": "同款英文，口语化到展台上能直接照着说，90 词以内",',
      '  "pitch_notes": ["说这段 pitch 的现场提示（中文）", "…", "…"]（3 条的字符串数组）',
      '}',
      '注意：pitch_notes 是字符串数组。只输出 JSON。',
    ].join('\n'),
    maxTokens: 1400,
    temperature: 0.65,
  });

  const callB = callJSON({
    system: sysBase,
    user: [
      '【企业画像】', profileText, '【体检摘要】', summaryText, '【路演站点】', stopText, '',
      '【任务】生成企业的「话术类」物料，语言按站点所在市场（默认英语；若站点在日语/阿语市场，仍以英语为主，附一句当地语问候）。',
      '【输出 JSON 结构】',
      '{',
      '  "greeting": "当地语问候一句（含语言名标注，如 \"阿拉伯语\"），附中文读音提示",',
      '  "openers": ["展台开场 2 句英文，第一句勾住路过买家"],',
      '  "faqs": [',
      '    {"q_en": "海外买家在展台最可能问的问题（英文）", "a_zh": "参考回答中文", "a_en": "参考回答英文"}',
      '    —— 共 5 条，覆盖：价格区间、起订量 MOQ、交期、认证资质、售后/合作方式',
      '  ],',
      '  "social": [',
      '    {"phase": "展前 1 周", "text_en": "LinkedIn 帖子英文", "text_zh": "中文对照"},',
      '    {"phase": "展会期间", "text_en": "...", "text_zh": "..."},',
      '    {"phase": "展后跟进", "text_en": "...", "text_zh": "..."}',
      '  ]',
      '}',
      '注意：faqs 是 5 个对象的数组，social 是 3 个对象的数组，openers 是 2 个字符串的数组。只输出 JSON。',
    ].join('\n'),
    maxTokens: 1800,
    temperature: 0.65,
  });

  const [a, b] = await Promise.all([callA, callB]);
  if (a.error) return json({ error: a.error, detail: a.detail || '', side: '身份类物料', status: a.status || 0 }, 502);
  if (b.error) return json({ error: b.error, detail: b.detail || '', side: '话术类物料', status: b.status || 0 }, 502);
  return json({ data: { ...a.data, ...b.data }, model: ascii(a.model + '+' + b.model) });
};

export const config = { path: '/api/materials' };
