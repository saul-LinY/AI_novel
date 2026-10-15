"""Measure BM25 candidate reranking over the same four views as live recall."""
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/graphiti'))
from reranking import EvidenceRanker


async def main():
    ranker = EvidenceRanker('.ai-novel/graphiti/models')
    inputs = json.load(open(sys.argv[1]))
    results = []
    for row in inputs:
        start = time.perf_counter()
        views = list(row['views'])
        hits = await asyncio.gather(*(ranker.rank(row['query'], row['views'][v], 5) for v in views))
        results.append(dict(name=row['name'], query=row['query'], ms=round((time.perf_counter()-start)*1000), views=dict(zip(views, hits))))
        print(json.dumps(dict(name=row['name'], ms=results[-1]['ms']), ensure_ascii=False), flush=True)
    with open(sys.argv[2], 'w') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


asyncio.run(main())
