"""Deletion must not leave obsolete publishing PNGs or erase other files."""
import tempfile
import unittest
from pathlib import Path
from server import publish_pngs


class PublishAfterPageDeletion(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.output, self.recovery = [self.root/n for n in ('render', 'output', 'recovery')]
        self.source.mkdir(); self.output.mkdir()
        (self.source/'card_1.png').write_bytes(b'new-first')
        (self.output/'card_1.png').write_bytes(b'old-first')
        (self.output/'card_2.png').write_bytes(b'preserve-surplus')
        (self.output/'notes.txt').write_text('user material')

    def test_full_export_archives_surplus_and_preserves_other_files(self):
        publish_pngs(self.source, self.output, self.recovery, True)
        self.assertEqual((self.output/'card_1.png').read_bytes(), b'new-first')
        self.assertFalse((self.output/'card_2.png').exists())
        self.assertEqual((self.recovery/'card_2.png').read_bytes(), b'preserve-surplus')
        self.assertEqual((self.output/'notes.txt').read_text(), 'user material')

    def test_single_page_export_keeps_other_pages(self):
        publish_pngs(self.source, self.output, self.recovery)
        self.assertEqual((self.output/'card_2.png').read_bytes(), b'preserve-surplus')
        self.assertFalse(self.recovery.exists())

    def test_empty_render_does_not_remove_published_pages(self):
        (self.source/'card_1.png').unlink()
        with self.assertRaises(ValueError):
            publish_pngs(self.source, self.output, self.recovery, True)
        self.assertTrue((self.output/'card_2.png').exists())


if __name__ == '__main__':
    unittest.main()
