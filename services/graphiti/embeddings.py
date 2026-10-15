"""CPU-local Chinese embeddings; no hosted embedding key is required."""
import asyncio
from functools import lru_cache

import numpy as np
from fastembed import TextEmbedding
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.cross_encoder.client import CrossEncoderClient

MODEL_NAME = 'BAAI/bge-small-zh-v1.5'


class LocalEmbedder(EmbedderClient):
    def __init__(self, cache_dir):
        self.model = TextEmbedding(MODEL_NAME, cache_dir=cache_dir, threads=2)
        self.lock = asyncio.Lock()

    @lru_cache(maxsize=4096)
    def _embed(self, text):
        return next(iter(self.model.embed([text]))).tolist()

    async def create(self, input_data):
        text = input_data if isinstance(input_data, str) else input_data[0]
        if not isinstance(text, str):
            raise ValueError('Text embedding requires strings')
        async with self.lock:
            return await asyncio.to_thread(self._embed, text)

    async def create_batch(self, input_data_list):
        return [await self.create(text) for text in input_data_list]


class LocalSimilarityRanker(CrossEncoderClient):
    """Explicit cosine fallback; main search uses RRF, not an LLM reranker."""
    def __init__(self, embedder):
        self.embedder = embedder

    async def rank(self, query, passages):
        q = await self.embedder.create(query)
        vectors = await self.embedder.create_batch(passages)
        return sorted(zip(passages, [float(np.dot(q, v)) for v in vectors]), key=lambda x: x[1], reverse=True)
