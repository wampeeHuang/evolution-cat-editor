from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit, quote
from urllib.request import urlopen
import json, re, hashlib, threading, queue, uuid, subprocess, shutil, time, html, os, hmac, base64
from contextlib import ExitStack

TOOL = Path(__file__).resolve().parent
CONFIG = json.loads((TOOL/'config.json').read_text('utf8'))
CONTENT = Path(CONFIG['contentRoot']).resolve()
VIDEO_ROOT = Path(CONFIG['videoRoot']).resolve() if CONFIG.get('videoRoot') else None
PORT = CONFIG['port']
BASE = f'http://127.0.0.1:{PORT}'
PAT = r'(<script type="application/json" id="document-state">)(.*?)(</script>)'
LOCKS = {}; LOCK_GUARD = threading.Lock()
JOBS = {}; JOB_LOCK = threading.Lock(); Q = queue.Queue()
TESTS = TOOL/'_runtime/fixtures'
META_FILE = TOOL/'_runtime/catalog-metadata.json'
META_LOCK = threading.RLock()

def catalog_meta():
    if META_FILE.exists(): return json.loads(META_FILE.read_text('utf8'))
    return {'categories':['工具推荐','产品分享','未分类'],'articles':{}}

def store_catalog_meta(meta):
    META_FILE.parent.mkdir(parents=True,exist_ok=True)
    tmp=META_FILE.with_suffix('.tmp');tmp.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8');tmp.replace(META_FILE)

def catalog_items():
    with META_LOCK:
        meta=catalog_meta();items=[]
        for aid,root in catalog().items():
            model=read_model(root);info=meta['articles'].get(aid,{})
            default='工具推荐' if any(w in root.name for w in ['工具','画布']) else '产品分享' if '求反馈' in root.name else '未分类'
            pictures=model['cards'][0].get('pictures',[])
            cover='/articles/'+aid+'/01_图卡/cards/card_1.png' if (root/'01_图卡/cards/card_1.png').is_file() else '/articles/'+aid+'/'+pictures[0]['image'] if pictures else '/icon.svg'
            items.append({'id':aid,'title':model.get('copy',{}).get('shared',{}).get('title') or root.name,'draft':aid.startswith('draft-'),'folder':root.name,'path':str(root),'category':info.get('category',default),'created':root.stat().st_ctime,'lastOpened':info.get('lastOpened'),'status':info.get('status','已发布' if info.get('published',False) else '待调整'),'count':len(model['cards']),'cover':cover,'trashedAt':info.get('trashedAt')})
        return {'items':items,'categories':meta['categories']}

DELETE_SECRET = os.urandom(32)

def deletion_entry(kind, aid, meta):
    if kind not in ['article','video']: raise ValueError('内容类型无效')
    root=(article if kind=='article' else video_project)(aid).resolve()
    parents=[CONTENT,TOOL/'_runtime/free-pages',TESTS] if kind=='article' else [VIDEO_ROOT,TESTS]
    if not any(parent and root.parent==parent.resolve() for parent in parents): raise ValueError('不允许删除此目录')
    prefix=('draft-' if root.parent==(TOOL/'_runtime/free-pages').resolve() else 'test-' if root.parent==TESTS.resolve() else '') if kind=='article' else ('test-video-' if root.parent==TESTS.resolve() else 'v')
    length=16 if kind=='article' or prefix=='test-video-' else 15
    if aid!=prefix+hashlib.sha256(root.name.encode()).hexdigest()[:length]: raise ValueError('目录别名与作品身份不一致')
    info=meta.get('articles' if kind=='article' else 'videos',{}).get(aid,{})
    if not info.get('trashedAt'): raise ValueError('只能永久删除已隐藏的内容，请先从列表隐藏')
    # Reject junctions/reparse points anywhere in the tree; never follow external files.
    paths=[root]
    digest=hashlib.sha256();count=0;size=0
    while paths:
        path=paths.pop()
        st=path.lstat()
        if path.is_symlink() or getattr(st,'st_file_attributes',0)&0x400: raise ValueError('目录包含链接或联接点，请在本地文件夹核对后处理')
        if not path.resolve().is_relative_to(root): raise ValueError('文件路径超出作品目录')
        if path.is_dir(): paths.extend(sorted(path.iterdir(),reverse=True))
        if path.is_file(): count+=1;size+=st.st_size
        digest.update(json.dumps([str(path.relative_to(root)),st.st_size,st.st_mtime_ns],ensure_ascii=False).encode())
    with JOB_LOCK:
        if any(j.get('articleId')==aid and j.get('state') in ['queued','running'] for j in JOBS.values()): raise ValueError('作品正在导出，请完成后再删除')
    title=(read_model(root).get('copy',{}).get('shared',{}).get('title') if kind=='article' else video_folder_title(root.name)) or root.name
    return {'id':aid,'title':title,'path':str(root),'type':'自由草稿' if aid.startswith('draft-') else '图文作品' if kind=='article' else '视频项目','files':count,'bytes':size,'fingerprint':digest.hexdigest()}

def deletion_ids(ids):
    if not isinstance(ids,list) or not 1<=len(ids)<=100 or any(not isinstance(x,str) for x in ids) or len(set(ids))!=len(ids): raise ValueError('请选择1–100个不同条目')
    return sorted(ids)

def deletion_preview(kind, ids):
    ids=deletion_ids(ids)
    with ExitStack() as stack:
        for aid in ids: stack.enter_context(lock_for(aid))
        with META_LOCK: entries=[deletion_entry(kind,aid,catalog_meta()) for aid in ids]
    payload={'kind':kind,'entries':entries,'expires':time.time()+600}
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()
    token=base64.urlsafe_b64encode(raw).decode()+'.'+hmac.new(DELETE_SECRET,raw,hashlib.sha256).hexdigest()
    return {'entries':[{k:v for k,v in e.items() if k!='fingerprint'} for e in entries],'token':token,'expiresIn':600}

def delete_hidden(kind, ids, token):
    ids=deletion_ids(ids)
    try:
        encoded,signature=token.split('.')
        raw=base64.urlsafe_b64decode(encoded)
        if not hmac.compare_digest(signature,hmac.new(DELETE_SECRET,raw,hashlib.sha256).hexdigest()): raise ValueError()
        plan=json.loads(raw)
        if plan['kind']!=kind or [e['id'] for e in plan['entries']]!=ids or plan['expires']<time.time(): raise ValueError()
    except Exception: raise ValueError('删除确认已失效，请重新核对删除范围')
    result={'deleted':[],'failed':[]}
    with ExitStack() as stack:
        for aid in ids: stack.enter_context(lock_for(aid))
        with META_LOCK:
            meta=catalog_meta()
            current=[deletion_entry(kind,aid,meta) for aid in ids]
            if current!=plan['entries']: raise ValueError('内容或路径已变化，请重新预览后确认')
            for entry in current:
                try:
                    # Only the checked absolute, direct-child project path is removed.
                    shutil.rmtree(Path(entry['path']))
                    meta.setdefault('articles' if kind=='article' else 'videos',{}).pop(entry['id'],None)
                    store_catalog_meta(meta)
                    result['deleted'].append(entry['id'])
                except OSError as error:
                    result['failed'].append({'id':entry['id'],'error':str(error),'path':entry['path']})
    return result

def lock_for(aid):
    with LOCK_GUARD: return LOCKS.setdefault(aid, threading.Lock())

# ── 视频发布板块 ──────────────────────────────────────────────
# 只读扫描 config.json 的可选 videoRoot（直接子目录，YYYYMMDD_ 开头），
# 状态用项目根目录的 .published/.parked/.abandoned 标记，与 视频/CLAUDE.md 生命周期一致。
VIDEO_SKIP_DIRS = {'_runtime','_recovery','node_modules','.git','.workbuddy','assets','素材','分镜',
                   'evidence','public','src','qa-frames','配乐','音效','node_modules'}
VIDEO_EXTS = {'.mp4','.mov','.m4v','.webm'}
VIDEO_DIR_PRIORITY = {'成片':0,'交付':1,'成片输出':1,'renders':2}
VIDEO_MARKERS = {'published':'.published','parked':'.parked','abandoned':'.abandoned'}
VIDEO_STATUS_LABEL = {'draft':'待发布','published':'已发布','parked':'先放着','abandoned':'不发了'}
VIDEO_PROBE_CACHE = {}

def video_catalog():
    if not VIDEO_ROOT or not VIDEO_ROOT.is_dir(): return {}
    out = {}
    for d in VIDEO_ROOT.iterdir():
        if not d.is_dir() or not re.match(r'^\d{8}_', d.name): continue
        out['v'+hashlib.sha256(d.name.encode()).hexdigest()[:15]] = d.resolve()
    return out

def video_project(aid):
    found = video_catalog()
    if isinstance(aid,str) and aid.startswith('test-video-') and TESTS.exists():
        for root in TESTS.iterdir():
            if root.is_dir() and aid=='test-video-'+hashlib.sha256(root.name.encode()).hexdigest()[:16]:
                found[aid]=root.resolve()
    if aid not in found: raise ValueError('视频目录不存在')
    return found[aid]

def video_folder_title(name):
    return re.sub(r'^\d{8}_', '', name) or name

def mp4_meta(p):
    """纯标准库读 mvhd/tkhd，得到时长与分辨率（不依赖 ffprobe）。失败返回空值。"""
    try:
        st = p.stat(); key = (str(p), st.st_size, int(st.st_mtime))
        if key in VIDEO_PROBE_CACHE: return VIDEO_PROBE_CACHE[key]
        meta = {'duration': None, 'width': None, 'height': None}
        with open(p, 'rb') as f:
            def boxes(off, end):
                while off + 8 <= end:
                    f.seek(off); hdr = f.read(8)
                    if len(hdr) < 8: break
                    size = int.from_bytes(hdr[:4], 'big'); typ = hdr[4:8].decode('latin1')
                    if size == 1: size = int.from_bytes(f.read(8), 'big')
                    elif size == 0: size = end - off
                    if size < 8: break
                    yield typ, off, size
                    off += size
            for typ, off, size in boxes(0, st.st_size):
                if typ != 'moov': continue
                for t2, o2, s2 in boxes(off + 8, off + size):
                    if t2 == 'mvhd':
                        f.seek(o2 + 8); data = f.read(min(s2 - 8, 40))
                        ver = data[0]
                        if ver == 0: ts = int.from_bytes(data[12:16], 'big'); dur = int.from_bytes(data[16:20], 'big')
                        else: ts = int.from_bytes(data[20:24], 'big'); dur = int.from_bytes(data[24:32], 'big')
                        if ts: meta['duration'] = dur / ts
                    elif t2 == 'trak':
                        for t3, o3, s3 in boxes(o2 + 8, o2 + s2):
                            if t3 != 'tkhd': continue
                            f.seek(o3 + 8); data = f.read(min(s3 - 8, 96))
                            ver = data[0]
                            woff = 76 if ver == 0 else 88
                            w = int.from_bytes(data[woff:woff+4], 'big') >> 16
                            h = int.from_bytes(data[woff+4:woff+8], 'big') >> 16
                            if w and h and not meta['width']: meta['width'], meta['height'] = w, h
                break
        VIDEO_PROBE_CACHE[key] = meta
        return meta
    except Exception:
        return {'duration': None, 'width': None, 'height': None}

def video_files(root):
    items = []
    for base, dirs, names in os.walk(root):
        rel = Path(base).relative_to(root)
        if len(rel.parts) >= 3: dirs[:] = []
        dirs[:] = [d for d in dirs if d not in VIDEO_SKIP_DIRS and not d.startswith('.')]
        for name in names:
            p = Path(base) / name
            if p.suffix.lower() not in VIDEO_EXTS or not p.is_file(): continue
            if any(w in p.stem for w in ('测试','预览','preview','temp')): continue
            parts = rel.parts
            prio = next((VIDEO_DIR_PRIORITY[x] for x in parts if x in VIDEO_DIR_PRIORITY), 3)
            try: st = p.stat()
            except OSError: continue
            meta = mp4_meta(p)
            items.append({'name': p.name, 'rel': str(p.relative_to(root)).replace('\\','/'),
                          'size': st.st_size, 'mtime': st.st_mtime, 'priority': prio,
                          'duration': meta['duration'], 'width': meta['width'], 'height': meta['height']})
    items.sort(key=lambda x: (x['priority'], -x['mtime']))
    return items

def video_cover(root):
    pats = ['成片/cover*','交付/*封面*','成片/*封面*','cover*','*封面*','交付/*cover*','*/cover*','*/*封面*']
    for pat in pats:
        cands = [p for p in root.glob(pat) if p.is_file() and p.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}]
        if cands: return sorted(cands, key=lambda p: -p.stat().st_mtime)[0]
    return None

def video_copy_file(root):
    for name in ['发布文案.txt','发布文案.md','发布.txt']:
        p = root / name
        if p.is_file(): return p
    for p in list(root.glob('*/*文案*.txt')) + list(root.glob('*/*文案*.md')):
        if p.is_file(): return p
    return None

def split_copy_sections(text):
    sections = []; cur = {'heading':'','lines':[]}
    for line in text.splitlines():
        m = re.match(r'^\s*([一二三四五六七八九十]+)\s*[、.．]\s*(.+?)\s*$', line)
        if m:
            if cur['lines'] or cur['heading']: sections.append(cur)
            cur = {'heading': m.group(2), 'lines': []}
        else:
            cur['lines'].append(line)
    if cur['lines'] or cur['heading']: sections.append(cur)
    return [{'heading': s['heading'], 'text': '\n'.join(s['lines']).strip()} for s in sections]

def parse_copy(text):
    out = {'title':'','body':'','tags':'','cover':'','todo':'','sections':[],'source':''}
    sections = split_copy_sections(text or '')
    for s in sections:
        h = s['heading']; t = s['text']
        if not h:
            if t and not out['body']: out['body'] = t
            continue
        if '标题' in h and not out['title']: out['title'] = t
        elif '正文' in h and not out['body']: out['body'] = t
        elif ('标签' in h or '话题' in h) and not out['tags']: out['tags'] = t
        elif '封面' in h and not out['cover']: out['cover'] = t
        elif any(k in h for k in ['待补','待办','补充','未完成']) and not out['todo']: out['todo'] = t
    out['sections'] = sections
    return out

def video_copy(root):
    p = video_copy_file(root)
    if not p: return {'title':'','body':'','tags':'','cover':'','todo':'','sections':[],'source':''}
    data = parse_copy(p.read_text('utf-8-sig', errors='replace'))
    data['source'] = p.name
    return data

def video_copy_revision(root):
    source=video_copy_file(root)
    return hashlib.sha256(source.read_bytes() if source else b'').hexdigest()

def save_video_copy(root, values, expected):
    if any(not isinstance(values.get(k),str) or len(values[k])>100000 for k in ['title','body','tags']):
        raise ValueError('发布文案字段无效')
    if expected!=video_copy_revision(root):return None
    source=video_copy_file(root) or root/'发布文案.txt'
    before=source.read_bytes() if source.exists() else b''
    if hashlib.sha256(before).hexdigest()!=expected:return None
    text=before.decode('utf-8-sig')
    pattern=r'(?m)^\s*[一二三四五六七八九十]+\s*[、.．]\s*(.+?)\s*$'
    headings=list(re.finditer(pattern,text)); replacements=[]; seen=set()
    for i,match in enumerate(headings):
        label=match[1]
        key='title' if '标题' in label else 'body' if '正文' in label else 'tags' if ('标签' in label or '话题' in label) else None
        if key and key not in seen:
            seen.add(key);replacements.append((match.end(),headings[i+1].start() if i+1<len(headings) else len(text),'\n'+values[key].strip()+'\n\n'))
    # A plain-text source is the body, rather than an extra competing body section.
    if not headings and text.strip():text='';seen.clear()
    for start,end,value in reversed(replacements):text=text[:start]+value+text[end:]
    missing=[(key,label) for key,label in [('title','作品标题'),('body','发布正文'),('tags','标签')] if key not in seen]
    for n,(key,label) in enumerate(missing,len(headings)+1):
        numerals=['一','二','三','四','五','六','七','八','九','十']
        text=text.rstrip()+'\n\n'+numerals[min(n-1,9)]+'、'+label+'\n'+values[key].strip()+'\n'
    if before:
        backup=TOOL/'_runtime/video-copy-recovery'/hashlib.sha256(str(root).encode()).hexdigest()[:16]
        backup.mkdir(parents=True,exist_ok=True)
        (backup/(hashlib.sha256(before).hexdigest()+'.txt')).write_bytes(before)
    tmp=source.with_name(source.name+'.saving-'+uuid.uuid4().hex)
    try:tmp.write_text(text.lstrip('\n'),encoding='utf8');tmp.replace(source)
    finally:
        if tmp.exists():tmp.unlink()
    return video_copy_revision(root)

def video_docs(root):
    wanted = {'script':['script.md','脚本.md'], 'retro':['复盘.md'], 'analysis':['选题分析.md']}
    found = {}
    for key, names in wanted.items():
        for name in names:
            p = root / name
            if p.is_file(): found[key] = p; break
        else:
            for p in list(root.glob('*/'+names[0]))[:1]:
                if p.is_file(): found[key] = p
    return found

def video_status(root):
    for key, marker in VIDEO_MARKERS.items():
        if (root / marker).exists(): return key
    return 'draft'

def set_video_status(root, status):
    if status != 'draft' and status not in VIDEO_MARKERS: raise ValueError('状态不存在')
    for key, marker in VIDEO_MARKERS.items():
        p = root / marker
        if key == status:
            if not p.exists(): p.write_text('', encoding='utf8')
        elif p.exists(): p.unlink()

def subtitle_found(root):
    for p in root.rglob('*'):
        if '_runtime' in p.parts or '_recovery' in p.parts: continue
        if p.is_file() and p.suffix.lower() in {'.srt','.ass','.vtt'}: return p.name
    return None

def video_gate(root, files, cover, copy, docs, status):
    srt = subtitle_found(root)
    copy_ready = bool(copy['title'] and copy['body']) and not copy['todo'].strip()
    items = [
        {'key':'script','label':'脚本','state':'ok' if 'script' in docs else 'missing','note':'script.md' if 'script' in docs else '缺 script.md'},
        {'key':'cover','label':'封面','state':'ok' if cover else 'missing','note': cover.name if cover else '缺封面图'},
        {'key':'final','label':'成片','state':'ok' if files else 'missing','note': files[0]['name'] if files else '缺成片 mp4'},
        {'key':'subtitle','label':'字幕','state':'ok' if srt else 'unknown','note': srt or '未检出外挂 srt（可能已烧录）'},
        {'key':'copy','label':'多平台文案','state':'ok' if copy_ready else 'missing','note': '文案已备齐' if copy_ready else ('缺发布文案.txt' if not (copy['title'] or copy['body']) else '还有待补项')},
        {'key':'retro','label':'复盘','state':'ok' if 'retro' in docs else 'missing','note':'复盘.md' if 'retro' in docs else '缺复盘.md'},
    ]
    done = sum(1 for i in items if i['state'] == 'ok')
    return {'items': items, 'done': done, 'total': len(items)}

def video_item(aid, root, detail=False):
    files = video_files(root); cover = video_cover(root); copy = video_copy(root)
    docs = video_docs(root); status = video_status(root)
    gate = video_gate(root, files, cover, copy, docs, status)
    created = root.stat().st_ctime
    stamps = [root.stat().st_mtime] + [f['mtime'] for f in files]
    if cover: stamps.append(cover.stat().st_mtime)
    for p in docs.values(): stamps.append(p.stat().st_mtime)
    cp = video_copy_file(root)
    if cp: stamps.append(cp.stat().st_mtime)
    with META_LOCK: info=catalog_meta().get('videos',{}).get(aid,{})
    item = {
        'id': aid, 'title': copy['title'].strip() or video_folder_title(root.name), 'trashedAt':info.get('trashedAt'),
        'folder': root.name, 'path': str(root), 'created': created, 'updated': max(stamps),
        'status': status, 'statusLabel': VIDEO_STATUS_LABEL[status],
        'hasCover': bool(cover), 'cover': ('/video/'+aid+'/cover') if cover else '',
        'videoCount': len(files), 'gate': gate,
        'copyReady': bool(copy['title'] and copy['body']) and not copy['todo'].strip(),
        'hasCopy': bool(video_copy_file(root)),
        'mainVideo': next(({'name': f['name'], 'size': f['size'], 'duration': f['duration'],
                            'width': f['width'], 'height': f['height']} for f in files), None),
        'copy': copy if detail else None, 'copyRevision':video_copy_revision(root) if detail else None,
        'videos': [dict(f, url='/video/'+aid+'/media/'+str(i)) for i, f in enumerate(files)] if detail else None,
        'docs': {k: '/video/'+aid+'/doc/'+k for k in docs} if detail else None,
    }
    return item

def video_list():
    if not VIDEO_ROOT or not VIDEO_ROOT.is_dir():
        return {'configured': False, 'videoRoot': str(VIDEO_ROOT or ''), 'items': []}
    items = []
    for aid, root in video_catalog().items():
        try: items.append(video_item(aid, root))
        except (OSError, ValueError, TypeError): pass
    items.sort(key=lambda i: -(i['updated'] or 0))
    return {'configured': True, 'videoRoot': str(VIDEO_ROOT), 'items': items}

def video_media(root, index):
    files = video_files(root)
    if not isinstance(index, int) or not (0 <= index < len(files)): raise ValueError('视频不存在')
    p = (root / files[index]['rel']).resolve()
    p.relative_to(root)
    if not p.is_file(): raise ValueError('视频文件已不存在')
    return p

def catalog(tests=False):
    result = {}
    for parent, prefix in [(CONTENT, ''), (TOOL/'_runtime/free-pages', 'draft-')] + ([(TESTS, 'test-')] if tests else []):
        if not parent.exists(): continue
        for d in parent.iterdir():
            if not d.is_dir() or not (d/'index.html').is_file() or d.resolve().parent != parent.resolve(): continue
            try:
                model = read_model(d)
                if model.get('schema') != 'evolution-cat-photo-v2': continue
                aid = prefix + hashlib.sha256(d.name.encode()).hexdigest()[:16]
                result[aid] = d.resolve()
            except (ValueError, OSError, TypeError): pass
    return result
def article(aid):
    found = catalog(True)
    if aid not in found:
        if isinstance(aid,str) and aid.startswith('draft-'):
            parent=TOOL/'_runtime/free-pages'
            candidates=[d for d in parent.iterdir() if d.is_dir() and 'draft-'+hashlib.sha256(d.name.encode()).hexdigest()[:16]==aid] if parent.exists() else []
            if not candidates: raise ValueError('这份自由草稿的本地目录已不存在，旧链接无法打开。隐藏不会删除文件；请返回创作工坊查看现有作品，如需恢复请核对备份版本。')
        raise ValueError('稿件不存在或缺少兼容的编辑数据，请返回创作工坊查看现有作品')
    return found[aid]
def read_model(root):
    match = re.search(PAT, (root/'index.html').read_text('utf-8-sig'), re.S)
    if not match: raise ValueError('缺少编辑模型')
    return json.loads(match[2])
def revision(root): return hashlib.sha256((root/'index.html').read_bytes()).hexdigest()
def encode(model): return json.dumps(model, ensure_ascii=False).replace('<', r'\u003c')
def fonts():
    with urlopen('http://127.0.0.1:8770/api/fonts', timeout=5) as r: data=json.load(r)
    return [f for f in data if f.get('status')=='要' and f.get('lang')=='中文' and 'OFL' in f.get('license','') and re.fullmatch(r'[\w-]+',f.get('id',''))]
def validate(root, model):
    if model.get('schema')!='evolution-cat-photo-v2' or not 1 <= len(model.get('cards', [])) <= 50: raise ValueError('卡片格式不匹配')
    if any(c.get('kind')=='runtime-page' for c in model['cards']) and any(c.get('kind')!='runtime-page' for c in model['cards']): raise ValueError('自由页与旧版卡片不可混存')
    for k in ['title','body','tags']:
        if not isinstance(model.get('copy',{}).get('shared',{}).get(k),str): raise ValueError('文案字段缺失')
    t=model.get('theme',{})
    for k,lo,hi in [('heading',52,100),('body',24,44),('note',20,34)]:
        if not isinstance(t.get(k),(int,float)) or not lo<=t[k]<=hi: raise ValueError('字号超出范围')
    if t.get('palette') not in ['ink','green']: raise ValueError('颜色预设无效')
    for c in model['cards']:
        if c.get('kind') not in ['photo-cover','photo-double','photo-single','photo-tall','photo-decision','runtime-page']: raise ValueError('版式无效')
        if c.get('kind')=='runtime-page':
            from runtime_contract import validate_runtime
            validate_runtime(root,c)
        for p in c['pictures']:
            src=p['image']
            if src.startswith('data:image/'):
                if not re.fullmatch(r'data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+',src): raise ValueError('图片格式无效')
            elif not re.fullmatch(r'assets/products/[\w.-]+',src) or not (root/src).is_file(): raise ValueError('配图不属于当前篇目')
    # Free pages render baked inline styles and local runtime font faces. The
    # legacy theme's font IDs are retained as provenance, not active providers.
    if model['cards'][0].get('kind')!='runtime-page' and any(t.get('fonts',{}).values()):
        allowed={f['id'] for f in fonts()}
        if any(i and i not in allowed for i in t['fonts'].values()): raise ValueError('字体不在可用目录')
def served_html(root, aid, text=None, rev=None):
    text = text or (root/'index.html').read_text('utf-8-sig')
    match=re.search(PAT,text,re.S)
    if match:
        model=json.loads(match[2])
        if model['cards'][0].get('kind')=='runtime-page':
            from runtime_page import render_shell
            text=render_shell(TOOL,model)
    text = re.sub(r'<base\b[^>]*>', '', text)
    context={'articleId':aid, 'revision':rev or revision(root)}
    if aid=='07234e3e1ddeabab':
        text=text.replace('</body>','<script defer src="/web/legacy-free-copy.js"></script></body>')
    return text.replace('<head>', '<head><link rel="icon" type="image/svg+xml" href="/icon.svg"><base href="'+BASE+'/articles/'+aid+'/">'+'<script id="editor-context" type="application/json">'+encode(context)+'</script>')
def save(root, model):
    recovery=root/'_runtime/editor-recovery'; recovery.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/'index.html', recovery/(uuid.uuid4().hex+'.html'))
    text=(root/'index.html').read_text('utf-8-sig')
    text=re.sub(PAT, lambda m:m[1]+encode(model)+m[3],text,flags=re.S)
    tmp=root/'_runtime/editor-save.tmp'; tmp.write_text(text,encoding='utf8'); tmp.replace(root/'index.html')
    sp=root/'spec.json'; spec=json.loads(sp.read_text('utf-8-sig')) if sp.exists() else {'width':1080,'height':1440}
    spec.update(cards=model['cards'], copy=model['copy'], theme=model['theme'], source='index.html#document-state')
    sp.write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf8')
def update_job(jid, **values):
    with JOB_LOCK:
        JOBS[jid].update(values)
        (TOOL/'_runtime/jobs'/jid/'job.json').write_text(json.dumps(JOBS[jid],ensure_ascii=False,indent=2),encoding='utf8')
def worker():
    while True:
        jid=Q.get()
        try:
            job=JOBS[jid]; root=article(job['articleId']); jd=TOOL/'_runtime/jobs'/jid
            update_job(jid,state='running',started=time.time())
            proc=subprocess.run(['node',str(TOOL/'render.cjs'),BASE+'/jobs/'+jid+'/render.html?export=1',str(jd/'cards'),job['scope'],str(job['page'])],capture_output=True,text=True,encoding='utf8',errors='replace',timeout=120)
            if proc.returncode: raise ValueError(proc.stderr.strip() or 'PNG渲染失败')
            model=json.loads((jd/'model.json').read_text('utf8')); folder=Path(job['folder'])
            with lock_for(job['articleId']):
                if folder.is_relative_to(root) and revision(root)!=job['revision']: raise ValueError('导出期间原稿已更新；快照PNG保留在任务目录，未覆盖当前发布图')
                folder.mkdir(parents=True,exist_ok=True)
                for f in (jd/'cards').glob('card_*.png'): shutil.copy2(f,folder/f.name)
                synced=job['scope']=='all' and revision(root)==job['revision'] and model==read_model(root)
                if synced:
                    formal=root/'01_图卡/cards';formal.mkdir(parents=True,exist_ok=True)
                    for f in (jd/'cards').glob('card_*.png'): shutil.copy2(f,formal/f.name)
                    # The integrated editor is the publication UI; standalone compatibility link stays same-source.
                    (root/'发布面板.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url='+BASE+'/articles/'+job['articleId']+'/index.html#publish"><a href="'+BASE+'/articles/'+job['articleId']+'/index.html#publish">打开同源发布面板</a>',encoding='utf8')
            update_job(jid,state='done',finished=time.time(),count=len(list((jd/'cards').glob('card_*.png'))),synced=synced)
        except Exception as e: update_job(jid,state='failed',finished=time.time(),error=str(e))
        finally: Q.task_done()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(TOOL),**kwargs)
    def end_headers(self): self.send_header('Cache-Control','no-store');super().end_headers()
    def reply(self,status,data):
        raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json;charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def send_file(self,p,content=None):
        raw=content.encode() if content is not None else p.read_bytes();self.send_response(200);self.send_header('Content-Type',self.guess_type(str(p)));self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def send_media(self,p):
        """视频/封面按字节流返回；支持 Range，浏览器可拖动进度条。"""
        st=p.stat();size=st.st_size;ctype=self.guess_type(str(p)) or 'application/octet-stream'
        rng=self.headers.get('Range')
        if rng:
            m=re.match(r'bytes=(\d*)-(\d*)$',rng.strip())
            if not m: self.send_error(416);return
            start=int(m.group(1)) if m.group(1) else 0
            end=int(m.group(2)) if m.group(2) else size-1
            if start>end or start>=size: self.send_error(416);return
            end=min(end,size-1);length=end-start+1
            self.send_response(206)
            self.send_header('Content-Type',ctype);self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Content-Length',str(length))
            self.end_headers()
            with open(p,'rb') as f:
                f.seek(start);left=length
                while left>0:
                    chunk=f.read(min(256*1024,left))
                    if not chunk: break
                    self.wfile.write(chunk);left-=len(chunk)
            return
        self.send_response(200);self.send_header('Content-Type',ctype)
        self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',str(size));self.end_headers()
        with open(p,'rb') as f: shutil.copyfileobj(f,self.wfile)
    def do_HEAD(self):
        try:
            path=unquote(urlsplit(self.path).path);segs=[s for s in path.split('/') if s]
            if len(segs)>=4 and segs[0]=='video' and segs[2]=='media':
                root=video_project(segs[1]);p=video_media(root,int(segs[3]))
                st=p.stat();self.send_response(200);self.send_header('Content-Type',self.guess_type(str(p)) or 'application/octet-stream')
                self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',str(st.st_size));self.end_headers();return
            self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers()
        except Exception: self.send_error(404)
    def do_GET(self):
        try:
            path=unquote(urlsplit(self.path).path)
            if path in ['/icon.svg','/favicon.ico']:
                self.send_file(TOOL/'web/icon.svg');return
            if path=='/api/about': self.reply(200,{'version':(TOOL/'VERSION').read_text().strip(),'changelog':(TOOL/'CHANGELOG.md').read_text('utf8'),'port':PORT});return
            if path=='/api/catalog':self.reply(200,catalog_items());return
            if path.startswith('/web/runtime/'):
                from runtime_page import shared_asset
                self.send_file(shared_asset(TOOL,path[len('/web/runtime/'):]))
                return
            if path in ['/web/publish-ui.js','/web/publish.css','/web/catalog.js','/web/catalog.css','/web/lifecycle.js','/web/legacy-free-copy.js','/web/video.js','/web/video.css','/web/video-detail.js','/web/video.html','/web/video-detail.html']:
                self.send_file(TOOL/path.lstrip('/'));return
            if path in ['/video','/video/']:
                self.send_file(TOOL/'web/video.html');return
            if path=='/api/videos':self.reply(200,video_list());return
            if path.startswith('/api/video/'):
                aid=path.split('/')[-1];root=video_project(aid)
                self.reply(200,video_item(aid,root,detail=True));return
            if path.startswith('/video/'):
                segs=[s for s in path.split('/') if s];aid=segs[1];root=video_project(aid);rest=segs[2:]
                if not rest:self.send_file(TOOL/'web/video-detail.html');return
                if rest[0]=='media' and len(rest)==2:self.send_media(video_media(root,int(rest[1])));return
                if rest[0]=='cover' and len(rest)==1:
                    p=video_cover(root)
                    if not p:raise ValueError('没有封面')
                    self.send_media(p);return
                if rest[0]=='doc' and len(rest)==2:
                    if rest[1]=='copy':
                        p=video_copy_file(root)
                    else:
                        p=video_docs(root).get(rest[1])
                    if not p:raise ValueError('资料不存在')
                    raw=p.read_text('utf-8-sig',errors='replace').encode('utf-8')
                    self.send_response(200);self.send_header('Content-Type','text/plain;charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
                self.send_error(404);return
            if path.startswith('/api/jobs/'):
                jid=path.split('/')[-1]
                with JOB_LOCK: j=dict(JOBS.get(jid,{}));j['ahead']=sum(1 for x in JOBS.values() if x['state'] in ['queued','running'] and x['created']<j.get('created',0))
                self.reply(200 if j.get('id') else 404,j);return
            if path.startswith('/font/'):
                f=next(f for f in fonts() if f['id']==path.split('/')[-1])
                with urlopen('http://127.0.0.1:8770/'+quote(f['file']),timeout=15) as r: raw=r.read()
                self.send_response(200);self.send_header('Content-Type','font/otf');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
            if path in ['/','/index.html']:
                self.send_file(TOOL/'web/catalog.html');return
            if path.startswith('/articles/'):
                _,_,aid,*rest=path.split('/');root=article(aid);rel='/'.join(rest) or 'index.html'
                if rel.startswith('assets/editor/'):
                    target=TOOL/'web'/Path(rel).name
                else: target=(root/rel).resolve();target.relative_to(root)
                if rel=='index.html':
                    with META_LOCK:
                        meta=catalog_meta();meta['articles'].setdefault(aid,{})['lastOpened']=time.time();store_catalog_meta(meta)
                    with lock_for(aid): self.send_file(target,served_html(root,aid))
                else:self.send_file(target)
                return
            if path.startswith('/jobs/'):
                _,_,jid,filename=path.split('/')
                if filename!='render.html' or jid not in JOBS: raise ValueError('任务不存在')
                self.send_file(TOOL/'_runtime/jobs'/jid/filename);return
            self.send_error(404)
        except Exception as e:self.reply(404,{'error':str(e)})
    def do_POST(self):
        if self.headers.get('Origin') not in [BASE,f'http://localhost:{PORT}']:self.reply(403,{'error':'仅允许同源本地请求'});return
        try:
            n=int(self.headers.get('Content-Length',0))
            if not 0<n<=32*1024*1024:raise ValueError('请求大小无效')
            p=json.loads(self.rfile.read(n));route=urlsplit(self.path).path
            if route=='/api/content-delete-preview':
                self.reply(200,deletion_preview(p.get('kind'),p.get('ids')));return
            if route=='/api/content-delete':
                self.reply(200,delete_hidden(p.get('kind'),p.get('ids'),p.get('token','')));return
            if route=='/api/content-lifecycle':
                kind=p.get('kind');aid=p.get('id');action=p.get('action')
                if kind not in ['article','video'] or action not in ['trash','restore']:raise ValueError('操作无效')
                (article if kind=='article' else video_project)(aid)
                with META_LOCK:
                    meta=catalog_meta();info=meta.setdefault('articles' if kind=='article' else 'videos',{}).setdefault(aid,{})
                    if action=='trash':info.setdefault('trashedAt',time.time())
                    else:info.pop('trashedAt',None)
                    store_catalog_meta(meta)
                self.reply(200,{'saved':True,'trashed':action=='trash'});return
            if route=='/api/video-copy':
                aid=p.get('id');root=video_project(aid)
                with lock_for(aid): result=save_video_copy(root,p.get('copy',{}),p.get('revision'))
                if result is None:self.reply(409,{'error':'文案已在其他位置更新，请保留当前输入并重新打开核对'});return
                self.reply(200,{'saved':True,'revision':result});return
            if route=='/api/video-status':
                aid=p.get('id');root=video_project(aid);status=p.get('status')
                if status!='draft' and status not in VIDEO_MARKERS:raise ValueError('状态不存在')
                with lock_for(aid): set_video_status(root,status)
                self.reply(200,{'saved':True,'status':status,'label':VIDEO_STATUS_LABEL[status]});return
            if route=='/api/open-video-folder':
                aid=p.get('id');root=video_project(aid);target=p.get('target','root')
                if target=='final':
                    files=video_files(root)
                    if not files:raise ValueError('还没有成片文件')
                    folder=(root/files[0]['rel']).parent.resolve()
                else:folder=root
                if not folder.is_relative_to(root) or not folder.is_dir():raise ValueError('目录不存在')
                os.startfile(str(folder));self.reply(200,{'opened':True,'folder':str(folder)});return
            if route=='/api/free-pages':
                from runtime_page import create_draft
                aid,root=create_draft(TOOL)
                self.reply(201,{'articleId':aid,'url':'/articles/'+aid+'/index.html','path':str(root)})
                return
            if route=='/api/fonts':self.reply(200,{'fonts':[{'id':f['id'],'name':f['name']} for f in fonts()]});return
            if route=='/api/free-copy':
                source=article(p['articleId'])
                with lock_for(p['articleId']):
                    if p.get('revision')!=revision(source):
                        self.reply(409,{'error':'原稿已更新，请重新打开后再创建副本'});return
                    original=read_model(source)
                    if any(c.get('kind')=='runtime-page' for c in original['cards']): raise ValueError('此入口用于旧版图文')
                    from runtime_page import create_legacy_copy
                    jid=uuid.uuid4().hex;jd=TOOL/'_runtime/jobs'/jid;jd.mkdir(parents=True)
                    rev=revision(source)
                    with JOB_LOCK:JOBS[jid]={'id':jid,'articleId':p['articleId'],'state':'converting','created':time.time()}
                    update_job(jid)
                    (jd/'render.html').write_text(served_html(source,p['articleId'],rev=rev),encoding='utf8')
                    proc=subprocess.run(['node',str(TOOL/'render.cjs'),BASE+'/jobs/'+jid+'/render.html?export=1',str(jd),'capture-layout','0'],capture_output=True,text=True,encoding='utf8',errors='replace',timeout=90)
                    if proc.returncode:
                        update_job(jid,state='failed',error=proc.stderr.strip());raise ValueError('原版式读取失败：'+proc.stderr.strip())
                    pages=json.loads((jd/'layout.json').read_text('utf8'))
                    aid,root=create_legacy_copy(TOOL,source,original,pages,p['articleId'],rev)
                    update_job(jid,state='done',finished=time.time(),copyArticleId=aid)
                self.reply(201,{'articleId':aid,'url':'/articles/'+aid+'/index.html','path':str(root)})
                return
            if route=='/api/catalog-meta':
                with META_LOCK:
                    meta=catalog_meta()
                    if 'newCategory' in p:
                        name=p['newCategory']
                        if not isinstance(name,str) or not 1<=len(name.strip())<=20:raise ValueError('分类名称需为1至20字')
                        name=name.strip()
                        if name=='全部' or name in meta['categories']:raise ValueError('分类名称已存在或不可用')
                        meta['categories'].append(name)
                    else:
                        aid=p['articleId'];article(aid)
                        if 'status' in p:
                            if p['status'] not in ['已放弃','待调整','已发布']:raise ValueError('状态不存在')
                            info=meta['articles'].setdefault(aid,{})
                            info['status']=p['status'];info.pop('published',None)
                        else:
                            if p.get('category') not in meta['categories']:raise ValueError('分类不存在')
                            meta['articles'].setdefault(aid,{})['category']=p['category']
                    store_catalog_meta(meta)
                self.reply(200,{'saved':True});return
            root=article(p['articleId']);aid=p['articleId']
            if route in ['/api/role-recovery-preview','/api/recover-roles']:
                from role_recovery import preview as role_preview, apply as apply_roles, artwork_fingerprint
                with lock_for(aid):
                    rev=revision(root)
                    if p.get('revision')!=rev:
                        self.reply(409,{'error':'稿件已更新，请刷新后重新恢复类别；未覆盖作品。'});return
                    model=read_model(root);report=role_preview(root,model,include_opt_out=p.get('includeOptOut') is True)
                    if route=='/api/role-recovery-preview' or not report['decisions']:
                        self.reply(200,dict(report,revision=rev));return
                    recovered=apply_roles(root,model,report);validate(root,recovered)
                    rid=uuid.uuid4().hex;backup=TOOL/'_runtime/role-recovery'/aid/rid;backup.mkdir(parents=True)
                    shutil.copy2(root/'index.html',backup/'before-index.html')
                    if (root/'spec.json').exists():shutil.copy2(root/'spec.json',backup/'before-spec.json')
                    evidence={'articleId':aid,'beforeRevision':rev,'report':report,'unchangedArtwork':all(artwork_fingerprint(a['html'])==artwork_fingerprint(b['html']) for a,b in zip(model['cards'],recovered['cards']))}
                    (backup/'report.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
                    save(root,recovered);evidence['afterRevision']=revision(root)
                    (backup/'report.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
                self.reply(200,dict(report,revision=evidence['afterRevision'],recoveryId=rid,unchangedArtwork=evidence['unchangedArtwork']));return
            if route=='/api/config':self.reply(200,{'folder':str(root)});return
            if route=='/api/open-article-folder':
                os.startfile(str(root))
                self.reply(200,{'opened':True,'folder':str(root)});return
            if route=='/api/open-publish-folder':
                folder=(root/'01_图卡'/'cards').resolve()
                if not folder.is_relative_to(root) or not folder.is_dir():raise ValueError('正式图片目录不存在，请先导出PNG')
                os.startfile(str(folder))
                self.reply(200,{'opened':True,'folder':str(folder)});return
            model=p['model'];validate(root,model)
            if route=='/api/save':
                with lock_for(aid):
                    if p.get('revision')!=revision(root):self.reply(409,{'error':'保存冲突：原稿已被其他标签页或Agent更新。你的编辑已保留，请下载当前编辑副本后重新打开最新原稿。','conflict':True});return
                    save(root,model);new_revision=revision(root)
                self.reply(200,{'revision':new_revision,'saved':True});return
            if route!='/api/export':self.reply(404,{'error':'接口不存在'});return
            scope=p.get('scope');page=p.get('page',0)
            if scope not in ['all','current'] or not isinstance(page,int) or not 0<=page<len(model['cards']):raise ValueError('导出范围无效')
            folder=Path(p.get('folder') or root).resolve()
            if folder==Path(folder.anchor):raise ValueError('请选择具体文件夹')
            for other in catalog(True).values():
                if other!=root and folder.is_relative_to(other):raise ValueError('禁止把PNG写入另一篇目录')
            jid=uuid.uuid4().hex;jd=TOOL/'_runtime/jobs'/jid;jd.mkdir(parents=True)
            with lock_for(aid):
                rev=revision(root)
                if p.get('revision')!=rev:self.reply(409,{'error':'导出冲突：原稿已更新，请先处理保存冲突。'});return
                text=(root/'index.html').read_text('utf-8-sig');text=re.sub(PAT,lambda m:m[1]+encode(model)+m[3],text,flags=re.S)
                (jd/'render.html').write_text(served_html(root,aid,text,rev),encoding='utf8')
            (jd/'model.json').write_text(encode(model),encoding='utf8')
            with JOB_LOCK:JOBS[jid]={'id':jid,'articleId':aid,'state':'queued','created':time.time(),'scope':scope,'page':page,'folder':str(folder),'revision':rev}
            update_job(jid);Q.put(jid);self.reply(202,{'jobId':jid})
        except Exception as e:self.reply(400,{'error':str(e)})
    def log_message(self,*args):pass

if __name__=='__main__':
    for stored in (TOOL/'_runtime/jobs').glob('*/job.json'):
        old=json.loads(stored.read_text('utf8'));JOBS[old['id']]=old
        if old['state'] in ['queued','running']:update_job(old['id'],state='failed',error='服务已重启，导出中断；请重新提交。')
    threading.Thread(target=worker,daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
