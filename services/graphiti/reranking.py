"""Local multilingual cross-encoder ranking over literal source passages."""
import asyncio
import re
from collections import OrderedDict

from fastembed.rerank.cross_encoder import TextCrossEncoder

MODEL_NAME = 'BAAI/bge-reranker-v2-m3-int8'


def passages(text, size=260):
    if len(text) <= size:
        return [text]
    # Overlapping verbatim windows; the client verifies membership in the full
    # card. Suffix evidence does not disappear behind a long paragraph prefix.
    starts = [0]
    for m in re.finditer(r'[。！？；\n]', text):
        start = m.end()
        if start < len(text) and start - starts[-1] >= size // 2:
            starts.append(start)
    starts.extend(range(0, len(text), size // 2))
    starts.append(max(0, len(text) - size))
    return list(dict.fromkeys(text[start:start + size] for start in sorted(set(starts)) if text[start:start + size].strip()))


class EvidenceRanker:
    def __init__(self, cache_dir):
        self.model = TextCrossEncoder(MODEL_NAME, cache_dir=cache_dir, threads=4)
        self.cache = OrderedDict()
        self.lock = asyncio.Lock()

    async def rank(self, query, cards, limit):
        pairs = [(card, text) for card in cards for text in passages(card['text'])]
        async with self.lock:
            missing = list(dict.fromkeys(text for _, text in pairs if (query, text) not in self.cache))
            if missing:
                scores = await asyncio.to_thread(lambda: list(self.model.rerank(query, missing, batch_size=4)))
                for text, score in zip(missing, scores):
                    self.cache[(query, text)] = float(score)
            scored = [(card, text, self.cache[(query, text)]) for card, text in pairs]
            while len(self.cache) > 8192:
                self.cache.popitem(last=False)
        best = {}
        for card, text, score in scored:
            if card['cardId'] not in best or score > best[card['cardId']]['score']:
                best[card['cardId']] = {k: v for k, v in card.items() if k != 'text'} | dict(score=score, excerpt=text)
        return sorted(best.values(), key=lambda x: (-x['score'], x['cardId']))[:limit]
