"""Allow upstream static objects and inline formatting, never executable markup."""
from html.parser import HTMLParser
import re

class RuntimeDocument(HTMLParser):
    def __init__(self,root):super().__init__();self.root=root;self.objects=set();self.slides=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag not in {'section','div','span','p','h1','h2','h3','small','strong','em','b','i','u','s','br','font','img','button','input','label','video','source','svg','path'}:raise ValueError('运行时稿件不接受标签：'+tag)
        if any(k.lower().startswith('on') or k in {'srcdoc','formaction'} for k,v in attrs):raise ValueError('运行时稿件不接受事件脚本')
        if re.search(r'url\s*\(|expression\s*\(|javascript:|@import',a.get('style',''),re.I):raise ValueError('内联样式不得含脚本或外置资源')
        if 'data-oid' in a:
            if not re.fullmatch(r'[\w-]{1,100}',a['data-oid']) or a['data-oid'] in self.objects:raise ValueError('对象身份重复或无效')
            self.objects.add(a['data-oid'])
        if tag=='section' and 'slide' in a.get('class','').split():
            if not a.get('id') or a['id'] in self.slides:raise ValueError('页面身份重复或缺失')
            self.slides.add(a['id'])
        if tag in {'img','video','source'}:
            src=a.get('src','')
            if src.startswith('data:image/'):
                if not re.fullmatch(r'data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+',src):raise ValueError('图片数据无效')
            elif not re.fullmatch(r'assets/products/[\w.-]+',src) or not (self.root/src).is_file():raise ValueError('媒体必须属于当前隔离稿件')

def validate_runtime(root,card):
    value=card.get('html')
    if not isinstance(value,str) or len(value.encode())>14*1024*1024:raise ValueError('运行时稿件大小无效')
    doc=RuntimeDocument(root);doc.feed(value);doc.close()
    if len(doc.slides)!=1 or not doc.objects:raise ValueError('本轮只验证一张带对象的图卡')
