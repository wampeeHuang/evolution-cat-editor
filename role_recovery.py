"""Recover semantic roles from a verified conversion snapshot, never typography guesses.

Matching and patching are separate. The preview is read-only; patching changes
only three metadata attributes on uniquely identified text objects.
"""
from collections import Counter
from html.parser import HTMLParser
import hashlib
import html
import json
import re
import unicodedata

META = {'data-text-role', 'data-source-origin', 'data-role-origin'}
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}


def normalized(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip()


def text_hash(text):
    return hashlib.sha256(normalized(text).encode('utf8')).hexdigest()


class Node:
    def __init__(self, tag='', attrs=(), parent=None, start=0, raw=''):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.start, self.raw, self.children = start, raw, []

    @property
    def classes(self):
        return set(self.attrs.get('class', '').split())

    def text(self):
        return ''.join(c if isinstance(c, str) else '\n' if c.tag == 'br' else c.text() for c in self.children)

    def ancestors(self):
        p = self.parent
        while p:
            yield p
            p = p.parent


class Document(HTMLParser):
    def __init__(self, value):
        super().__init__(convert_charrefs=True)
        self.value = value
        self.offsets = [0]
        for m in re.finditer('\n', value): self.offsets.append(m.end())
        self.root = Node()
        self.stack = [self.root]
        self.nodes = []
        self.feed(value)
        self.close()

    def handle_starttag(self, tag, attrs):
        line, col = self.getpos()
        node = Node(tag, attrs, self.stack[-1], self.offsets[line-1]+col, self.get_starttag_text())
        self.stack[-1].children.append(node)
        self.nodes.append(node)
        if tag not in VOID: self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag: self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def legacy_role(node):
    """The same semantic selectors used by the original typography stylesheet."""
    parents = list(node.ancestors())
    if node.tag == 'h2' or 'question' in node.classes: return 'heading', 'h2/.question'
    if node.classes & {'note','credit'}: return 'note', '.note/.credit'
    if node.tag == 'span' and any(p.tag == 'footer' or 'eyebrow' in p.classes for p in parents):
        return 'note', 'footer/.eyebrow span'
    if 'lead' in node.classes or (node.tag in {'h3','p'} and any('photo-figure' in p.classes for p in parents)):
        return 'body', '.lead/.photo-figure h3,p'
    return None, None


def source_entries(value):
    # Old documents often render their DOM from document-state at load time.
    # Recover from those authoritative fields without executing snapshot scripts.
    embedded=re.search(r'<script\b[^>]*id=["\x27]document-state["\x27][^>]*>(.*?)</script>',value,re.S)
    if embedded:
        model=json.loads(embedded[1])
        if model.get('schema')=='evolution-cat-photo-v2' and all(c.get('kind')!='runtime-page' for c in model.get('cards',[])):
            pages=[]
            for i,card in enumerate(model['cards']):
                group=[]
                def field(path,text,role,basis,key=None):
                    if isinstance(text,str) and normalized(text):
                        group.append({'role':role,'basis':basis,'text':normalized(text),'path':path,'key':key or 'field:'+path})
                field('label',card.get('label'),'note','.eyebrow span')
                field('',f'{i+1:02}','note','.eyebrow span','system:eyebrow-number')
                field('title',card.get('title'),'heading','h2')
                field('lead',card.get('lead'),'body','.lead')
                for j,picture in enumerate(card.get('pictures',[])):
                    field(f'pictures.{j}.name',picture.get('name'),'body','.photo-figure h3')
                    field(f'pictures.{j}.caption',picture.get('caption'),'body','.photo-figure p')
                    field(f'pictures.{j}.credit',picture.get('credit'),'note','.credit')
                field('question',card.get('question'),'heading','.question')
                field('note',card.get('note'),'note','.note')
                field('',model.get('footer') or '进化猫','note','footer span','system:footer')
                field('',f'{i+1} / {len(model["cards"])}','note','footer span','system:page-number')
                pages.append(group)
            return pages
    doc = Document(value)
    posters = [n for n in doc.nodes if 'poster' in n.classes]
    entries = []
    for i, poster in enumerate(posters):
        group = []
        for node in doc.nodes:
            if poster not in node.ancestors(): continue
            role, basis = legacy_role(node)
            if not role or not normalized(node.text()): continue
            group.append({'role':role, 'basis':basis, 'text':normalized(node.text()),
                          'path':node.attrs.get('data-path',''), 'key':f'p{i+1}-text-{len(group)+1}'})
        entries.append(group)
    return entries


def current_objects(value):
    doc = Document(value)
    result = []
    for node in doc.nodes:
        if 'data-slide-object' not in node.attrs: continue
        children = [n for n in doc.nodes if 'slide-object-text' in n.classes and node in n.ancestors()]
        if len(children) == 1: result.append((node, children[0]))
    return result


def preview(root, model, include_opt_out=False):
    conversion = model.get('conversion', {})
    if conversion.get('mode') != 'rendered-layout-v1':
        return {'supported':False, 'reason':'此稿没有可追溯的旧稿转换记录', 'decisions':[], 'pending':[]}
    snapshot = (root/'source-index.html').resolve()
    if not snapshot.is_relative_to(root.resolve()) or not snapshot.is_file():
        raise ValueError('缺少转换时的原稿快照，不能自动恢复')
    raw = snapshot.read_bytes()
    source_revision = hashlib.sha256(raw).hexdigest()
    if source_revision != conversion.get('sourceRevision'):
        raise ValueError('原稿快照与转换记录不一致，已停止自动恢复')
    source = source_entries(raw.decode('utf-8-sig'))
    if len(source) != conversion.get('pages'): raise ValueError('原稿快照页数与转换记录不一致')
    decisions, pending, kept = [], [], 0
    ids = Counter(n.attrs.get('data-oid') for c in model['cards'] for n,t in current_objects(c['html']))
    for card in model['cards']:
        objects = current_objects(card['html'])
        hints = {int(m[1]) for n,t in objects if (m:=re.fullmatch(r'p(\d+)-o\d+', n.attrs.get('data-oid','')))}
        page_match = re.fullmatch(r'card-(\d+)', card['id'])
        page = int(page_match[1]) if page_match else next(iter(hints)) if len(hints)==1 else None
        for obj, text in objects:
            oid = obj.attrs.get('data-oid')
            if obj.attrs.get('data-text-role') not in {None,'','unassigned'} or obj.attrs.get('data-role-origin')=='manual' or (obj.attrs.get('data-role-origin')=='source-opt-out' and not include_opt_out):
                kept += 1
                continue
            if not oid or ids[oid] != 1:
                pending.append({'cardId':card['id'],'objectId':oid,'reason':'对象编号缺失或重复'})
                continue
            origin = {}
            try: origin = json.loads(obj.attrs.get('data-source-origin','{}'))
            except (ValueError, TypeError): pass
            candidates = []
            if origin.get('sourceRevision')==source_revision and isinstance(origin.get('sourcePage'),int):
                p = origin['sourcePage']
                if 1<=p<=len(source):
                    candidates = [e for e in source[p-1] if e['key']==origin.get('sourceKey')]
                    if len(candidates)==1: page=p
            match = 'stored-provenance' if len(candidates)==1 else 'exact-source-text'
            if len(candidates)!=1:
                candidates = [e for e in source[page-1] if e['text']==normalized(text.text())] if page and 1<=page<=len(source) else []
                # Without an original object ID, identical text is only a suggestion.
                if not re.fullmatch(r'p\d+-o\d+', oid): candidates=[]
            if len(candidates)!=1:
                pending.append({'cardId':card['id'],'objectId':oid,'reason':'文字已改动、重复或来源无法唯一对应'})
                continue
            entry=candidates[0]
            new_origin={'version':1,'kind':'source-recovery-v1','sourceArticleId':conversion.get('sourceArticleId'),
                        'sourceRevision':source_revision,'sourcePage':page,'sourceKey':entry['key'],
                        'sourcePath':entry['path'],'basis':entry['basis'],'role':entry['role'],
                        'match':match,'previousRole':obj.attrs.get('data-text-role')}
            decisions.append({'cardId':card['id'],'objectId':oid,'role':entry['role'],'origin':new_origin,
                              'expectedTextHash':text_hash(text.text())})
    # Multiple current candidates for the same original node are not automatically assigned.
    counts=Counter((d['origin']['sourcePage'],d['origin']['sourceKey']) for d in decisions)
    unique=[]
    for d in decisions:
        if counts[(d['origin']['sourcePage'],d['origin']['sourceKey'])]>1:
            pending.append({'cardId':d['cardId'],'objectId':d['objectId'],'reason':'多个对象对应同一原稿文字'})
        else: unique.append(d)
    return {'supported':True,'sourceVerified':True,'sourceRevision':source_revision,'kept':kept,
            'counts':dict(Counter(d['role'] for d in unique)),'decisions':unique,'pending':pending}


def patch_html(value, decisions):
    by_id={d['objectId']:d for d in decisions}
    patches=[]
    for node,text in current_objects(value):
        d=by_id.get(node.attrs.get('data-oid'))
        if not d: continue
        if node.attrs.get('data-text-role') not in {None,'','unassigned'}: raise ValueError('文字类别已改变，请重新预览')
        if text_hash(text.text())!=d['expectedTextHash']: raise ValueError('文字内容已改变，请重新预览')
        tag=node.raw
        for key in META:
            tag=re.sub(r'\s+'+re.escape(key)+r'\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)', '', tag)
        attrs={'data-text-role':d['role'],'data-role-origin':'source-recovery','data-source-origin':json.dumps(d['origin'],ensure_ascii=False,separators=(',',':'))}
        replacement=tag[:-1]+''.join(f' {k}="{html.escape(v,quote=True)}"' for k,v in attrs.items())+'>'
        patches.append((node.start,len(node.raw),replacement))
    if len(patches)!=len(decisions): raise ValueError('对象数量变化，请重新预览')
    for start,length,replacement in sorted(patches,reverse=True): value=value[:start]+replacement+value[start+length:]
    return value


def artwork_fingerprint(value):
    """Compare every token except role/provenance metadata; no visual edits allowed."""
    doc=Document(value)
    tokens=[]
    def visit(node):
        tokens.append((node.tag,sorted((k,v) for k,v in node.attrs.items() if k not in META)))
        for child in node.children:
            if isinstance(child,str): tokens.append(('text',child))
            else: visit(child)
        tokens.append(('end',node.tag))
    visit(doc.root)
    return hashlib.sha256(json.dumps(tokens,ensure_ascii=False).encode()).hexdigest()


def apply(root, model, report):
    import copy
    result=copy.deepcopy(model)
    for card in result['cards']:
        decisions=[d for d in report['decisions'] if d['cardId']==card['id']]
        old=card['html'];card['html']=patch_html(old,decisions)
        if artwork_fingerprint(old)!=artwork_fingerprint(card['html']):
            raise ValueError('恢复将改变作品内容或外观，已停止')
    return result
