"""Fictional source-recovery contracts: python -m unittest role_recovery_test."""
import copy
import hashlib
import html
import json
from pathlib import Path
import tempfile
import unittest

from role_recovery import preview, apply, source_entries, current_objects, artwork_fingerprint


class RoleRecoveryTests(unittest.TestCase):
    def setUp(self):
        runtime=(Path(__file__).resolve().parent/'_runtime').resolve()
        runtime.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(prefix='role-recovery-test-',dir=runtime)
        self.root=Path(self.temp.name)
        self.original={'schema':'evolution-cat-photo-v2','footer':'虚构品牌','cards':[
            {'kind':'photo-single','label':f'栏目{i}','title':f'标题{i}','lead':f'正文{i}',
             'note':f'注释{i}','pictures':[],'question':''} for i in range(1,3)]}
        raw=('<script type="application/json" id="document-state">'+json.dumps(self.original,ensure_ascii=False)+'</script>').encode()
        (self.root/'source-index.html').write_bytes(raw)
        self.revision=hashlib.sha256(raw).hexdigest()
        cards=[]
        for i,entries in enumerate(source_entries(raw.decode())):
            nodes=''.join(f'<div data-slide-object="" data-object-type="text" data-oid="p{i+1}-o{j+1}" style="left:80px;top:{80+j*100}px;width:800px"><div class="slide-object-text" style="font-size:32px">{html.escape(e["text"])}</div></div>' for j,e in enumerate(entries))
            cards.append({'id':f'card-{i+1:02}','kind':'runtime-page','title':'虚构','pictures':[], 'html':f'<section class="slide poster" id="card-{i+1:02}">{nodes}</section>'})
        self.model={'schema':'evolution-cat-photo-v2','cards':cards,'conversion':{'mode':'rendered-layout-v1','pages':2,'sourceRevision':self.revision,'sourceArticleId':'fictional-source'}}

    def tearDown(self): self.temp.cleanup()

    def test_restore_roles_changes_only_metadata(self):
        report=preview(self.root,self.model)
        self.assertFalse(report['pending']);self.assertEqual(len(report['decisions']),14)
        recovered=apply(self.root,self.model,report)
        for a,b in zip(self.model['cards'],recovered['cards']):
            self.assertEqual(artwork_fingerprint(a['html']),artwork_fingerprint(b['html']))
        self.assertEqual(preview(self.root,recovered)['decisions'],[])

    def test_wrong_snapshot_never_guesses(self):
        (self.root/'source-index.html').write_text('changed',encoding='utf8')
        with self.assertRaises(ValueError): preview(self.root,self.model)

    def test_manual_role_is_kept(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-slide-object=""','data-text-role="independent" data-role-origin="manual" data-slide-object=""',1)
        report=preview(self.root,self.model);self.assertEqual(report['kept'],1)
        self.assertNotIn('p1-o1',[d['objectId'] for d in report['decisions']])

    def test_explicitly_undone_role_stays_unassigned(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-slide-object=""','data-role-origin="manual" data-slide-object=""',1)
        report=preview(self.root,self.model)
        self.assertEqual(report['kept'],1)
        self.assertNotIn('p1-o1',[d['objectId'] for d in report['decisions']])

    def test_source_opt_out_requires_explicit_retry(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-slide-object=""','data-role-origin="source-opt-out" data-slide-object=""',1)
        automatic=preview(self.root,self.model)
        explicit=preview(self.root,self.model,include_opt_out=True)
        self.assertNotIn('p1-o1',[d['objectId'] for d in automatic['decisions']])
        self.assertIn('p1-o1',[d['objectId'] for d in explicit['decisions']])

    def test_changed_text_without_provenance_is_pending(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('标题1','改过的标题')
        report=preview(self.root,self.model);self.assertEqual(len(report['pending']),1)

    def test_provenance_survives_text_edit_and_page_reorder(self):
        recovered=apply(self.root,self.model,preview(self.root,self.model))
        recovered['cards'][0]['html']=recovered['cards'][0]['html'].replace('标题1','改过的标题').replace('data-text-role="heading"','data-text-role="unassigned"')
        recovered['cards'].reverse()
        report=preview(self.root,recovered)
        self.assertEqual(len(report['decisions']),1)
        self.assertEqual(report['decisions'][0]['origin']['match'],'stored-provenance')

    def test_duplicate_current_ids_are_pending(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-oid="p1-o2"','data-oid="p1-o1"')
        report=preview(self.root,self.model)
        self.assertEqual(len(report['pending']),2)

    def test_new_object_does_not_borrow_old_role(self):
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-oid="p1-o3"','data-oid="new-user-object"')
        report=preview(self.root,self.model)
        self.assertEqual(len(report['pending']),1)

    def test_text_changed_between_preview_and_apply_is_rejected(self):
        report=preview(self.root,self.model)
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('标题1','又改了一次')
        with self.assertRaises(ValueError): apply(self.root,self.model,report)

    def test_duplicate_source_text_requires_confirmation(self):
        self.original['cards'][0]['lead']=self.original['cards'][0]['title']
        raw=('<script id="document-state" type="application/json">'+json.dumps(self.original,ensure_ascii=False)+'</script>').encode()
        (self.root/'source-index.html').write_bytes(raw)
        self.model['conversion']['sourceRevision']=hashlib.sha256(raw).hexdigest()
        report=preview(self.root,self.model)
        self.assertTrue(any(d['objectId']=='p1-o3' for d in report['pending']))

    def test_role_attribute_cannot_be_changed_after_preview(self):
        report=preview(self.root,self.model)
        self.model['cards'][0]['html']=self.model['cards'][0]['html'].replace('data-slide-object=""','data-text-role="note" data-slide-object=""',1)
        with self.assertRaises(ValueError): apply(self.root,self.model,report)


if __name__=='__main__': unittest.main()
