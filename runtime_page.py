"""Shared free-card shell. Article document-state remains the only content authority."""
from pathlib import Path
import hashlib
import json
import re
import uuid
import html
import math
import shutil


def create_legacy_copy(tool, source, original, pages, source_id, revision):
    """Freeze a rendered legacy layout into independent editable objects."""
    if len(pages) != len(original['cards']) or not 1 <= len(pages) <= 50:
        raise ValueError('副本页数与原稿不一致')
    folder = 'copy-' + uuid.uuid4().hex[:12]
    root = tool / '_runtime/free-pages' / folder
    cards = []
    from role_recovery import source_entries, normalized
    source_texts=source_entries((source/'index.html').read_text(encoding='utf-8-sig'))
    allowed_css = {'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration','white-space','word-break','overflow-wrap','color','padding-top','padding-right','padding-bottom','padding-left','box-sizing','background-color','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','object-fit','object-position'}
    esc = lambda s: html.escape(str(s), quote=True)
    for i, page in enumerate(pages):
        objects = []
        for j, item in enumerate(page['objects']):
            kind = item['kind']; box = item['box']
            if kind not in {'text','image','decoration'}: raise ValueError('未知对象类型')
            if any(not isinstance(box.get(k),(int,float)) or not math.isfinite(box[k]) or abs(box[k])>10000 for k in ['left','top','width','height']): raise ValueError('无效对象坐标')
            style = ';'.join(k+':'+str(v) for k,v in item['css'].items() if k in allowed_css)
            geometry = ';'.join(f'{k}:{box[k]:.6f}px' for k in ['left','top','width'])
            geometry += f';height:{box["height"]:.6f}px' if kind != 'text' else ''
            if kind == 'decoration':
                objects.append(f'<div aria-hidden="true" style="position:absolute;{esc(geometry)};{esc(style)};pointer-events:none"></div>')
                continue
            if kind == 'text':
                content=f'<div class="slide-object-text" contenteditable="false" style="{esc(style)};margin:0;min-height:0">{html.escape(item["text"])}</div>'
            else:
                src=item['src']
                if not re.fullmatch(r'assets/products/[\w.-]+',src) or not (source/src).is_file(): raise ValueError('图片不属于原稿')
                content=f'<div class="slide-object-graphic" style="overflow:hidden;border-radius:{esc(item["css"].get("border-radius","0"))}"><img src="{esc(src)}" style="{esc(style)};border-radius:0;width:100%;height:100%;display:block" alt=""></div>'
            role_attr = ''
            if kind == 'text':
                path=item.get('path','')
                candidates=[e for e in source_texts[i] if e['text']==normalized(item['text']) and (not path or e['path']==path)] if i<len(source_texts) else []
                if len(candidates)==1:
                    entry=candidates[0]
                    origin={'version':1,'kind':'legacy-conversion-v2','sourceArticleId':source_id,'sourceRevision':revision,'sourcePage':i+1,'sourceKey':entry['key'],'sourcePath':entry['path'],'basis':entry['basis'],'role':entry['role']}
                    role_attr=f' data-text-role="{entry["role"]}" data-role-origin="conversion" data-source-origin="{esc(json.dumps(origin,ensure_ascii=False,separators=(",",":")))}"'
                else:role_attr=' data-text-role="unassigned"'
            objects.append(f'<div class="slide-object" data-slide-object="" data-object-type="{kind}"{role_attr} data-oid="p{i+1}-o{j+1}" style="{esc(geometry)};min-height:0">{content}</div>')
        deck=f'<section class="slide poster visible" id="card-{i+1:02}" style="background:{esc(page["background"])};padding:0"><div class="slide-edit-layer">'+''.join(objects)+'</div></section>'
        cards.append({'id':f'card-{i+1:02}','kind':'runtime-page','title':original['cards'][i]['title'],'pictures':[],'html':deck})
    model=json.loads(json.dumps(original));model['cards']=cards
    model['copy']['shared']['title']+=' · 自由编辑副本'
    model['conversion']={'sourceArticleId':source_id,'sourceRevision':revision,'mode':'rendered-layout-v1','pages':len(cards)}
    from runtime_contract import validate_runtime
    for card in cards: validate_runtime(source,card)
    root.mkdir(parents=True,exist_ok=False)
    if (source/'assets/products').exists(): shutil.copytree(source/'assets/products',root/'assets/products')
    (root/'source-index.html').write_bytes((source/'index.html').read_bytes())
    data=json.dumps(model,ensure_ascii=False).replace('<',r'\u003c')
    (root/'index.html').write_text('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><script type="application/json" id="document-state">'+data+'</script></body></html>',encoding='utf8')
    return 'draft-'+hashlib.sha256(folder.encode()).hexdigest()[:16],root


def render_shell(tool, model):
    text = (tool / 'web/runtime/editor.html').read_text(encoding='utf-8')
    data = json.dumps(model, ensure_ascii=False).replace('<', r'\u003c')
    text = re.sub(r'(<script type="application/json" id="document-state">).*?(</script>)',
                  lambda m: m[1] + data + m[2], text, flags=re.S)
    deck = ''.join(re.sub(r'<!--DECK:(?:START|END)-->', '', card['html']) for card in model['cards'])
    return text.replace('<!--DECK:START--><!--DECK:END-->', '<!--DECK:START-->' + deck + '<!--DECK:END-->')


def create_draft(tool):
    """Persistent tool-owned draft, outside the user's finished-content directory."""
    folder = 'free-' + uuid.uuid4().hex[:12]
    root = tool / '_runtime/free-pages' / folder
    root.mkdir(parents=True, exist_ok=False)
    deck = ('<section class="slide poster visible" id="card-01"><div class="slide-edit-layer">'
            '<div data-slide-object="" class="slide-object" data-object-type="text" data-text-role="heading" data-role-origin="native" data-oid="title" '
            'style="left:8%;top:12%;width:84%"><div class="slide-object-text" contenteditable="false" '
            'style="font-size:72px;line-height:1.3">写下你的标题</div></div>'
            '<div data-slide-object="" class="slide-object" data-object-type="text" data-text-role="body" data-role-origin="native" data-oid="body" '
            'style="left:8%;top:30%;width:84%"><div class="slide-object-text" contenteditable="false" '
            'style="font-size:36px;line-height:1.5">从一句话开始。文字和图片都可以自由摆放。</div></div>'
            '</div></section>')
    model = {'schema': 'evolution-cat-photo-v2', 'footer': '进化猫',
             'theme': {'heading': 72, 'body': 32, 'note': 24, 'palette': 'ink', 'bold': True,
                       'fonts': {'heading': '', 'body': '', 'note': ''}},
             'copy': {'shared': {'title': '未命名自由图卡', 'body': '', 'tags': ''}},
             'cards': [{'id': 'card-01', 'kind': 'runtime-page', 'title': '自由图卡', 'pictures': [], 'html': deck}]}
    data = json.dumps(model, ensure_ascii=False).replace('<', r'\u003c')
    (root / 'index.html').write_text('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                                   '<title>自由图卡</title></head><body>'
                                   '<script type="application/json" id="document-state">' + data +
                                   '</script></body></html>', encoding='utf-8')
    return 'draft-' + hashlib.sha256(folder.encode()).hexdigest()[:16], root


def shared_asset(tool, relative):
    """Fonts are local runtime data, never accidentally committed with public source."""
    rel = Path(relative)
    if relative.startswith('vivi/media/fonts/'):
        base = tool / '_runtime/runtime-fonts/vivi'
        target = base / rel.name
    elif relative.startswith('vivi/library/') and rel.suffix.lower() in {'.ttf', '.otf', '.woff', '.woff2'}:
        base = tool / '_runtime/runtime-fonts/library'
        target = base / rel.name
    else:
        base = tool / 'web/runtime'
        target = base / rel
    target = target.resolve()
    target.relative_to(base.resolve())
    if not target.is_file():
        raise ValueError('编辑器资源不存在')
    return target
