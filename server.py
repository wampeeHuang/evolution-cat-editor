from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit, quote
from urllib.request import urlopen
import json, re, hashlib, threading, queue, uuid, subprocess, shutil, time, html, os

TOOL = Path(__file__).resolve().parent
CONFIG = json.loads((TOOL/'config.json').read_text('utf8'))
CONTENT = Path(CONFIG['contentRoot']).resolve()
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
            items.append({'id':aid,'title':model.get('copy',{}).get('shared',{}).get('title') or root.name,'folder':root.name,'path':str(root),'category':info.get('category',default),'created':root.stat().st_ctime,'lastOpened':info.get('lastOpened'),'status':info.get('status','已发布' if info.get('published',False) else '待调整'),'count':len(model['cards']),'cover':'/articles/'+aid+'/01_图卡/cards/card_1.png' if (root/'01_图卡/cards/card_1.png').is_file() else '/articles/'+aid+'/'+model['cards'][0]['pictures'][0]['image']})
        return {'items':items,'categories':meta['categories']}

def lock_for(aid):
    with LOCK_GUARD: return LOCKS.setdefault(aid, threading.Lock())
def catalog(tests=False):
    result = {}
    for parent, prefix in [(CONTENT, '')] + ([(TESTS, 'test-')] if tests else []):
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
    if aid not in found: raise ValueError('篇目不存在或不是兼容的可编辑稿')
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
    for k in ['title','body','tags']:
        if not isinstance(model.get('copy',{}).get('shared',{}).get(k),str): raise ValueError('文案字段缺失')
    t=model.get('theme',{})
    for k,lo,hi in [('heading',52,100),('body',24,44),('note',20,34)]:
        if not isinstance(t.get(k),(int,float)) or not lo<=t[k]<=hi: raise ValueError('字号超出范围')
    if t.get('palette') not in ['ink','green']: raise ValueError('颜色预设无效')
    for c in model['cards']:
        if c.get('kind') not in ['photo-cover','photo-double','photo-single','photo-tall','photo-decision']: raise ValueError('版式无效')
        for p in c['pictures']:
            src=p['image']
            if src.startswith('data:image/'):
                if not re.fullmatch(r'data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+',src): raise ValueError('图片格式无效')
            elif not re.fullmatch(r'assets/products/[\w.-]+',src) or not (root/src).is_file(): raise ValueError('配图不属于当前篇目')
    if any(t.get('fonts',{}).values()):
        allowed={f['id'] for f in fonts()}
        if any(i and i not in allowed for i in t['fonts'].values()): raise ValueError('字体不在可用目录')
def served_html(root, aid, text=None, rev=None):
    text = text or (root/'index.html').read_text('utf-8-sig')
    text = re.sub(r'<base\b[^>]*>', '', text)
    context={'articleId':aid, 'revision':rev or revision(root)}
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
    def do_GET(self):
        try:
            path=unquote(urlsplit(self.path).path)
            if path in ['/icon.svg','/favicon.ico']:
                self.send_file(TOOL/'web/icon.svg');return
            if path=='/api/about': self.reply(200,{'version':(TOOL/'VERSION').read_text().strip(),'changelog':(TOOL/'CHANGELOG.md').read_text('utf8'),'port':PORT});return
            if path=='/api/catalog':self.reply(200,catalog_items());return
            if path in ['/web/catalog.js','/web/catalog.css']:
                self.send_file(TOOL/path.lstrip('/'));return
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
            if route=='/api/fonts':self.reply(200,{'fonts':[{'id':f['id'],'name':f['name']} for f in fonts()]});return
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
