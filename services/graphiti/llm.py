"""Validate compatible-provider JSON at the boundary, before graph mutation."""
import logging
import time

from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from pydantic import ValidationError

logger = logging.getLogger('novel.graphiti.llm')


class ValidatedJSONClient(OpenAIGenericClient):
    async def generate_response(self, messages, response_model=None, **kwargs):
        feedback = ''
        started = time.monotonic()
        for attempt in range(3):
            # Graphiti adds schema and language instructions in place; each
            # attempt starts from the original messages, not the previous copy.
            current = [m.model_copy(deep=True) for m in messages]
            if feedback:
                current[-1].content += feedback
            result = await super().generate_response(current, response_model=response_model, **kwargs)
            try:
                result = response_model.model_validate(result).model_dump() if response_model else result
                logger.info('LLM schema=%s attempt=%s seconds=%.1f', getattr(response_model, '__name__', 'json'), attempt + 1, time.monotonic() - started)
                return result
            except ValidationError as e:
                if attempt == 2:
                    raise
                fields = [(x['loc'], x['type']) for x in e.errors(include_input=False, include_url=False)]
                feedback = '\n上次响应不符合 JSON schema，请重新生成完整对象，修正以下字段：' + str(fields)
        raise AssertionError('Unreachable')
