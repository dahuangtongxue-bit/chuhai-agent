#!/usr/bin/env python3
"""python3 build.py —— 把 src/ 拼成 public/index.html（Netlify 发布它）"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent
src = ROOT / 'src'
markup = (src / 'markup.html').read_text(encoding='utf-8')
parts = {k: (src / f).read_text(encoding='utf-8') for k, f in (('STYLE', 'style.css'), ('APP', 'app.js'))}
if '</script' in parts['APP'].lower():
    sys.exit('APP 里出现了 </script，会截断内联脚本')
page = markup
for k, v in parts.items():
    page = page.replace('/*__' + k + '__*/', v)
head = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="description" content="领航：宁商巡演 · 企业出海营销助手，帮鼓楼企业站上世界舞台">'
        '<meta name="theme-color" content="#0b6bcb">'
        '<link rel="icon" href="/icon.svg" type="image/svg+xml">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>')
(ROOT / 'public').mkdir(exist_ok=True)
(ROOT / 'public' / 'index.html').write_text(head + page + '</body></html>', encoding='utf-8')
print('public/index.html 已生成')
