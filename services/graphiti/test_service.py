import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient, ASGITransport
from graphiti_core.prompts.models import Message
from pydantic import BaseModel

from app import app, MemoryService, Search, Stream
from llm import ValidatedJSONClient
from queue_store import QueueStore


def stream(view='global'):
    text = '小白把蓝色本子归还阿青。'
    h = hashlib.sha256(text.encode()).hexdigest()
    return dict(scope='novel-' + 'a' * 32, view=view, headEventId='e1', fingerprint='b' * 64,
                events=[dict(id='e1', ordinal=1, timeMinutes=5, fingerprint='c' * 64,
                             records=[dict(id='d' * 64, contentHash=h, sourceEventId='e1', text=text, kind='narrative', ordinal=1, source='prose', entities=[])])])


class BoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_reset_removes_all_generations_and_waits_for_active_graph_writer(self):
        import asyncio
        import json
        with tempfile.TemporaryDirectory() as directory:
            service = MemoryService(Path(directory))
            p = stream()
            service.store.reconcile('owner', [p['scope']])
            job = service.store.submit(p)
            service.store.reconcile('owner', [])
            group = job['group_id']
            lock = service.locks.setdefault(group, asyncio.Lock())
            await lock.acquire()
            calls = []
            async def cypher(statement, params):
                calls.append((statement, params))
                if 'RETURN s.group_id' in statement:
                    return [{'groupId': 'old-generation'}]
                return [{'removed': 0}]
            service.cypher = cypher
            task = asyncio.create_task(service.cleanup_one_scope())
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            self.assertFalse(any('DETACH DELETE' in sql for sql, _ in calls))
            lock.release()
            await task
            deleted_groups = next(params['groups'] for sql, params in calls if 'DETACH DELETE' in sql)
            self.assertEqual(set(deleted_groups), {group, 'old-generation'})
            self.assertEqual(service.store.cleanup_pending(), 0)
            saved = service.store.db.execute('SELECT groups_json FROM retirements').fetchone()[0]
            self.assertEqual(set(json.loads(saved)), {group, 'old-generation'})
            service.store.close()

    async def test_view_annotations_do_not_modify_semantic_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            service = MemoryService(Path(directory))
            service.cypher = AsyncMock(return_value=[])
            await service.annotate_view('novel_test', 'scope', 'character:erii', '绘梨衣视角')
            statement, params = service.cypher.call_args.args
            self.assertIn('n.displayName=n.name', statement)
            self.assertNotIn('SET n.name=', statement)
            self.assertNotIn('MERGE', statement)
            self.assertEqual(params['view'], 'character:erii')
            self.assertEqual(service.view_label(dict(view='character:erii', events=[]), {'erii': '绘梨衣'}), '绘梨衣视角')
            service.store.close()

    def test_source_hash_and_event_identity_are_required(self):
        data = stream()
        self.assertEqual(Stream(**data).view, 'global')
        data['events'][0]['records'][0]['text'] = '被改写的文本'
        with self.assertRaises(ValueError):
            Stream(**data)
        data = stream()
        data['events'][0]['records'][0]['sourceEventId'] = 'future'
        with self.assertRaises(ValueError):
            Stream(**data)

    async def test_auth_and_durable_acceptance_do_not_call_model(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'GRAPHITI_API_TOKEN': 'test-secret'}):
            store = QueueStore(Path(directory) / 'queue.db')
            app.state.memory = SimpleNamespace(store=store, wake=SimpleNamespace(set=lambda: None))
            async with AsyncClient(transport=ASGITransport(app), base_url='http://test') as client:
                self.assertEqual((await client.get('/status')).status_code, 401)
                r = await client.post('/sync', headers={'Authorization': 'Bearer test-secret'}, json={'version': 1, 'streams': [stream()]})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()['streams'][0]['status'], 'pending')
            self.assertEqual(store.get('novel-' + 'a' * 32, 'global')['processed'], 0)
            store.close()


class SearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_embedding_search_returns_evidence_without_precision_ranker(self):
        with tempfile.TemporaryDirectory() as directory:
            service = MemoryService(Path(directory))
            service.ready = True
            p = stream()
            service.store.submit(p)
            job = service.store.next()
            service.store.finish(job)
            service.graph = SimpleNamespace(search_=AsyncMock(return_value=SimpleNamespace(edges=[])))
            service.embedder = SimpleNamespace(create=AsyncMock(side_effect=[[1, 0], [0, 1], [1, 0]]))
            cards = [dict(cardId='a', text='无关', contentHash='h', sourceEventId='e1'), dict(cardId='b', text='归还本子', contentHash='h2', sourceEventId='e1')]
            service.cypher = AsyncMock(side_effect=[[], cards])
            result = await service.search(Search(scope=p['scope'], view=p['view'], fingerprint=p['fingerprint'], query='本子', limit=1))
            self.assertEqual(result['ranking'], 'embedding')
            self.assertEqual(result['hits'][0]['cardId'], 'b')
            self.assertNotIn('excerpt', result['hits'][0])
            self.assertFalse(hasattr(service, 'evidence_ranker'))
            service.store.close()

    async def test_future_or_mutating_graph_is_not_searched(self):
        with tempfile.TemporaryDirectory() as directory:
            service = MemoryService(Path(directory))
            service.ready = True
            service.graph = SimpleNamespace(search_=AsyncMock())
            p = stream()
            service.store.submit(p)
            request = Search(scope=p['scope'], view=p['view'], fingerprint=p['fingerprint'], query='本子')
            self.assertEqual((await service.search(request))['state'], 'pending')
            job = service.store.next()
            service.store.finish(job)
            request.fingerprint = 'older-history'
            self.assertEqual((await service.search(request))['state'], 'snapshot_mismatch')
            request.view = 'character:unknown'
            self.assertEqual((await service.search(request))['state'], 'pending')
            service.graph.search_.assert_not_awaited()
            service.store.close()

    async def test_schema_retry_uses_fresh_prompts_and_returns_validated_json(self):
        class Response(BaseModel):
            value: int
        # No provider requests: test only the adapter's correction boundary.
        client = ValidatedJSONClient.__new__(ValidatedJSONClient)
        messages = [Message(role='system', content='schema test'), Message(role='user', content='return a value')]
        async def generate(current, **_kwargs):
            current[-1].content += '\nINJECTED_SCHEMA'
            return {'wrong': 1} if generate.calls == 0 else {'value': '2'}
        generate.calls = -1
        async def counted(current, **kwargs):
            generate.calls += 1
            return await generate(current, **kwargs)
        with patch('graphiti_core.llm_client.openai_generic_client.OpenAIGenericClient.generate_response', side_effect=counted) as parent:
            result = await client.generate_response(messages, Response)
        self.assertEqual(result, {'value': 2})
        self.assertEqual(parent.await_count, 2)
        self.assertEqual(messages[-1].content, 'return a value')


if __name__ == '__main__':
    unittest.main()
