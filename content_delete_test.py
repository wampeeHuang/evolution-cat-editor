"""Permanent deletion regression tests use only owned temporary fictional folders."""
import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import server as app

class ContentDeleteTest(unittest.TestCase):
    def setUp(self):
        base=app.TOOL/'_runtime';base.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(prefix='delete-test-',dir=base)
        self.root=Path(self.tmp.name).resolve();assert self.root.is_relative_to(base.resolve())
        self.content=self.root/'content';self.content.mkdir()
        self.videos=self.root/'videos';self.videos.mkdir()
        self.patches=[patch.object(app,'CONTENT',self.content),patch.object(app,'VIDEO_ROOT',self.videos),patch.object(app,'META_FILE',self.root/'meta.json'),patch.object(app,'TESTS',self.root/'fixtures'),patch.object(app,'JOBS',{})]
        for p in self.patches:p.start()
        app.store_catalog_meta({'articles':{},'videos':{},'categories':['未分类']})
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def article(self,name='fictional',hidden=True):
        root=self.content/name;root.mkdir();model={'schema':'evolution-cat-photo-v2','cards':[{'id':'one','html':'<section></section>'}],'copy':{'shared':{'title':'虚构删除测试'}}}
        (root/'index.html').write_text('<script type="application/json" id="document-state">'+json.dumps(model)+'</script>',encoding='utf8');(root/'asset.txt').write_text('synthetic',encoding='utf8')
        aid=hashlib.sha256(name.encode()).hexdigest()[:16];meta=app.catalog_meta();meta['articles'][aid]={'trashedAt':1} if hidden else {};app.store_catalog_meta(meta);return aid,root
    def test_batch_preview_and_delete(self):
        aid,a=self.article('a');bid,b=self.article('b');outside=self.root/'keep.txt';outside.write_text('keep')
        plan=app.deletion_preview('article',[aid,bid]);self.assertEqual(len(plan['entries']),2);self.assertTrue(a.exists());self.assertEqual(plan['entries'][0]['files'],2)
        result=app.delete_hidden('article',[bid,aid],plan['token']);self.assertEqual(set(result['deleted']),{aid,bid});self.assertFalse(result['failed']);self.assertFalse(a.exists());self.assertFalse(b.exists());self.assertTrue(outside.exists());self.assertFalse(app.catalog_meta()['articles'])
    def test_unhidden_and_wrong_id_rejected(self):
        aid,root=self.article(hidden=False)
        with self.assertRaises(ValueError):app.deletion_preview('article',[aid])
        with self.assertRaises(ValueError):app.deletion_preview('article',['../../content'])
        self.assertTrue(root.exists())
    def test_changed_content_and_restored_rejected(self):
        aid,root=self.article();plan=app.deletion_preview('article',[aid]);(root/'asset.txt').write_text('changed content')
        with self.assertRaises(ValueError):app.delete_hidden('article',[aid],plan['token'])
        plan=app.deletion_preview('article',[aid]);app.store_catalog_meta({'articles':{},'categories':[]})
        with self.assertRaises(ValueError):app.delete_hidden('article',[aid],plan['token'])
        self.assertTrue(root.exists())
    def test_token_scope_tamper_and_replay(self):
        aid,root=self.article();plan=app.deletion_preview('article',[aid])
        with self.assertRaises(ValueError):app.delete_hidden('article',[aid],plan['token']+'x')
        with self.assertRaises(ValueError):app.delete_hidden('video',[aid],plan['token'])
        app.delete_hidden('article',[aid],plan['token'])
        with self.assertRaises(ValueError):app.delete_hidden('article',[aid],plan['token'])
    def test_running_export_rejected(self):
        aid,root=self.article();app.JOBS['job']={'articleId':aid,'state':'queued'}
        with self.assertRaises(ValueError):app.deletion_preview('article',[aid])
        self.assertTrue(root.exists())
    def test_link_rejected(self):
        aid,root=self.article()
        with patch.object(Path,'is_symlink',lambda p:p==root/'asset.txt'):
            with self.assertRaises(ValueError):app.deletion_preview('article',[aid])
        self.assertTrue(root.exists())
    def test_video_delete(self):
        root=self.videos/'20261019_虚构测试';root.mkdir();(root/'video.txt').write_text('synthetic')
        aid='v'+hashlib.sha256(root.name.encode()).hexdigest()[:15];meta=app.catalog_meta();meta['videos'][aid]={'trashedAt':1};app.store_catalog_meta(meta)
        plan=app.deletion_preview('video',[aid]);result=app.delete_hidden('video',[aid],plan['token']);self.assertEqual(result['deleted'],[aid]);self.assertFalse(root.exists())

if __name__=='__main__':unittest.main()
