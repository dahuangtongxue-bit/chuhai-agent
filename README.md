# 领航 · 宁商巡演出海营销助手

企业出海营销助手（鼓楼黑客松 · 商贸赛道）。面向南京市鼓楼区企业，围绕「宁商巡演」（承办方/运营方：寰亚数据中标运营）做一条完整的出海路演服务闭环：

**出海体检 → 巡演匹配 → 物料工坊 → 市场锦囊 → 问领航**

1. **出海体检**：企业画像 → 准备度评分、五维分解、短板、30/60/90 天行动清单、推荐市场
2. **巡演匹配**：内置宁商巡演站点库（示例排期），按企业画像智能匹配最值得去的 3 站 + 理由 + 每站要拿到的成果
3. **物料工坊**：按画像 + 所选站点生成一页纸英文简介、30 秒电梯 pitch（中英）、展台高频问答 5 问、展前/展中/展后社媒文案；可复制、可下载 .md
4. **市场锦囊**：目标市场的礼仪、禁忌、准入认证、渠道打法、收款与定价，以及「借宁商巡演拿资源」的联动建议
5. **问领航**：带着企业画像和所选站点的流式自由问答

## 架构

- 前端：单页静态站（`src/` 拼成 `public/index.html`，python3 build.py，无 npm 依赖）
- 后端：Netlify Edge Functions（`netlify/edge-functions/`），OpenAI 兼容网关（默认零克云 deepseek-v4-flash-0731）
- 站点库单一数据源在 `src/app.js` 的 `STOPS`（正式排期出来只改这一处；匹配请求把站点库带给服务端）

## 环境变量（Netlify 后台 → Site configuration → Environment variables）

| 变量 | 说明 |
| --- | --- |
| `LLM_API_KEY` | 模型网关的 Key（必填，页面才有话说） |
| `LLM_API_BASE` | 默认 `https://api-model.gpulink.cc/v1`，可不填 |
| `LLM_MODEL` | 默认 `deepseek-v4-flash-0731`，可不填 |
| `LLM_MODEL_FALLBACK` | 备用模型，主模型挂了自动切，可不填 |
| `ACCESS_CODE` | 访问码（可选）：设了访客要先敲门，防链接外传被刷 |

## 本地跑

```bash
python3 build.py            # 改了 src/ 之后重新拼
netlify dev                 # http://localhost:8888（edge functions 会一起起）
```

本地调试模型 key：复制 `.env.example` 成 `.env` 填 `LLM_API_KEY`（netlify dev 会读）。

## 部署

git push 到 GitHub 仓库 → Netlify 关联仓库（build command `python3 build.py`，publish `public`），配好上面的环境变量即可。
