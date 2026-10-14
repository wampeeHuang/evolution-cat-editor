from pathlib import Path
import json,re,urllib.request,urllib.error,struct,hashlib
r=Path(__file__).parent;base='http://127.0.0.1:8797';aid='test-b356fcec67a86e57'
ar=r/'_runtime/fixtures/并发测试A';br=r/'_runtime/fixtures/并发测试B'
h=(ar/'index.html').read_bytes();m=json.loads(re.search(r'<script type="application/json" id="document-state">(.*?)</script>',h.decode(),re.S)[1])
assert m['copy']['shared']['title']=='A独立保存'
mb=json.loads(re.search(r'<script type="application/json" id="document-state">(.*?)</script>',(br/'index.html').read_text('utf8'),re.S)[1])
assert mb['copy']['shared']['title']=='B独立保存'
req=urllib.request.Request(base+'/api/export',data=json.dumps({'articleId':aid,'revision':hashlib.sha256(h).hexdigest(),'model':m,'folder':str(br),'scope':'all','page':0}).encode(),headers={'Content-Type':'application/json','Origin':base})
try:urllib.request.urlopen(req);raise AssertionError('cross-article output accepted')
except urllib.error.HTTPError as e:assert e.code==400;print(e.read().decode())
jobs=[json.loads(f.read_text('utf8')) for f in (r/'_runtime/jobs').glob('*/job.json') if json.loads(f.read_text('utf8')).get('state')=='done'];jobs.sort(key=lambda j:j['started'])
assert len(jobs)>=2 and jobs[0]['finished']<=jobs[1]['started']
for d,n in [(ar,2),(br,3)]:
 for i in range(1,n+1):
  data=(d/f'card_{i}.png').read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',data[16:24])==(1080,1440)
print('PASS: independent save, conflict did not overwrite A, queue serial, cross-article output rejected, 2+3 PNG files valid.')
