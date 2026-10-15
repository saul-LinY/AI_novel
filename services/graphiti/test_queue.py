import tempfile
import unittest
from pathlib import Path

from queue_store import QueueStore


def payload(*fingerprints, view='global'):
    return dict(scope='test-scope', view=view, headEventId=fingerprints[-1], fingerprint='|'.join(fingerprints),
                events=[dict(id=f'e{i}', fingerprint=x, records=[]) for i, x in enumerate(fingerprints)])


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'queue.db'
        self.store = QueueStore(self.path)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_durable_idempotent_append(self):
        first = self.store.submit(payload('a'))
        job = self.store.next()
        self.store.finish(job)
        self.assertEqual(self.store.submit(payload('a'))['status'], 'ready')
        self.assertIsNone(self.store.next())
        append = self.store.submit(payload('a', 'b'))
        self.assertEqual(append['group_id'], first['group_id'])
        self.assertEqual(append['processed'], 1)
        self.store.close()
        self.store = QueueStore(self.path)
        job = self.store.next()
        self.assertEqual(job['processed'], 1)
        self.store.finish(job)
        self.assertEqual(self.store.get('test-scope', 'global')['status'], 'ready')

    def test_rewrite_or_rewind_allocates_new_generation(self):
        first = self.store.submit(payload('a', 'b'))
        rewritten = self.store.submit(payload('a', 'c'))
        self.assertNotEqual(first['group_id'], rewritten['group_id'])
        rewind = self.store.submit(payload('a'))
        self.assertNotEqual(rewritten['group_id'], rewind['group_id'])

    def test_interrupted_graph_writes_rebuild_in_new_generation(self):
        self.store.submit(payload('a', 'b'))
        job = self.store.next()
        self.store.close()
        self.store = QueueStore(self.path)
        next_job = self.store.next()
        self.assertNotEqual(next_job['group_id'], job['group_id'])
        self.assertEqual(next_job['processed'], 0)

    def test_append_during_inflight_retains_crash_marker(self):
        self.store.submit(payload('a'))
        job = self.store.next()
        append = self.store.submit(payload('a', 'b'))
        self.assertEqual(append['status'], 'indexing')
        self.assertIsNone(self.store.next())
        self.store.finish(job)
        self.assertEqual(self.store.get('test-scope', 'global')['processed'], 1)
        self.assertEqual(self.store.next()['processed'], 1)

    def test_late_worker_cannot_publish_a_superseded_generation(self):
        self.store.submit(payload('a'))
        job = self.store.next()
        rewritten = self.store.submit(payload('other'))
        self.store.finish(job)
        current = self.store.get('test-scope', 'global')
        self.assertEqual(current['group_id'], rewritten['group_id'])
        self.assertEqual(current['processed'], 0)

    def test_failed_append_still_rebuilds_before_retry(self):
        self.store.submit(payload('a'))
        job = self.store.next()
        self.store.finish(job, 'timeout')
        self.assertEqual(self.store.submit(payload('a', 'b'))['status'], 'failed')
        next_job = self.store.next()
        self.assertNotEqual(next_job['group_id'], job['group_id'])

    def test_character_and_global_sources_are_independent(self):
        a = self.store.submit(payload('secret', view='global'))
        b = self.store.submit(payload('belief', view='character:a'))
        self.assertNotEqual(a['group_id'], b['group_id'])
        self.assertEqual(self.store.get('test-scope', 'character:a')['payload']['events'][0]['fingerprint'], 'belief')

    def test_reset_is_durable_and_late_worker_cannot_resurrect_scope(self):
        self.store.reconcile('owner', ['test-scope'])
        self.store.submit(payload('a'))
        job = self.store.next()
        self.store.reconcile('owner', [])
        self.store.finish(job)
        self.assertIsNone(self.store.get('test-scope', 'global'))
        self.assertIsNone(self.store.next())
        with self.assertRaises(ValueError):
            self.store.submit(payload('a'))
        self.store.close()
        self.store = QueueStore(self.path)
        self.assertEqual(self.store.next_retirement()['scope'], 'test-scope')
        self.assertEqual(self.store.cleanup_pending(), 1)
        self.store.finish_retirement('test-scope')
        self.assertEqual(self.store.cleanup_pending(), 0)
        self.assertTrue(self.store.retired('test-scope'))

    def test_reconcile_keeps_other_branches_and_other_story_owners(self):
        self.store.reconcile('one', ['test-scope', 'branch-two'])
        self.store.reconcile('two', ['unrelated'])
        for scope in ['test-scope', 'branch-two', 'unrelated']:
            self.store.submit({**payload('a'), 'scope': scope})
        self.store.reconcile('one', ['branch-two'])
        self.assertIsNotNone(self.store.get('branch-two', 'global'))
        self.assertIsNotNone(self.store.get('unrelated', 'global'))
        self.assertIsNone(self.store.get('test-scope', 'global'))
        with self.assertRaises(ValueError):
            self.store.reconcile('one', ['unrelated'])

    def test_failed_cleanup_retries_without_accepting_stale_writes(self):
        self.store.reconcile('owner', ['test-scope'])
        self.store.submit(payload('a'))
        self.store.reconcile('owner', [])
        self.store.finish_retirement('test-scope', failed=True)
        self.assertEqual(self.store.cleanup_pending(), 1)
        self.assertIsNone(self.store.next_retirement())
        self.store.db.execute('UPDATE retirements SET retry_at=0')
        self.store.db.commit()
        self.assertIsNotNone(self.store.next_retirement())


if __name__ == '__main__':
    unittest.main()
