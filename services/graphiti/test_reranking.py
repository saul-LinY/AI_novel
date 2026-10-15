import asyncio
from collections import OrderedDict
from types import SimpleNamespace
import unittest

from reranking import EvidenceRanker, passages


class PassageTests(unittest.TestCase):
    def test_windows_are_verbatim_and_include_tail_evidence(self):
        text = '无关的开头。' * 50 + '钥匙最后放进蓝盒子。'
        windows = passages(text)
        self.assertTrue(all(w in text and len(w) <= 260 for w in windows))
        self.assertTrue(any('钥匙最后放进蓝盒子。' in w for w in windows))
        self.assertEqual(passages('短引文。'), ['短引文。'])


class RankingTests(unittest.IsolatedAsyncioTestCase):
    async def test_best_literal_window_per_card_and_cache(self):
        ranker = EvidenceRanker.__new__(EvidenceRanker)
        ranker.lock = asyncio.Lock()
        ranker.cache = OrderedDict()
        calls = []
        def score(query, docs, **kwargs):
            calls.append((query, len(docs)))
            return [2.0 if '蓝盒子' in d else -4.0 for d in docs]
        ranker.model = SimpleNamespace(rerank=score)
        cards = [{'cardId': 'a', 'text': '无关的开头。' * 50 + '钥匙最后放进蓝盒子。'}, {'cardId': 'b', 'text': '天气很好。'}]
        result = await ranker.rank('钥匙在哪', cards, 2)
        self.assertEqual(result[0]['cardId'], 'a')
        self.assertIn('蓝盒子', result[0]['excerpt'])
        self.assertEqual(len(result), 2)
        await ranker.rank('钥匙在哪', cards, 2)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
