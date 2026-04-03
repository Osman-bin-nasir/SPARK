from __future__ import annotations

import json
from functools import lru_cache
from time import perf_counter
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from python_ai.config import DEFAULT_CHAT_MODEL, DEFAULT_DTYPE, DEFAULT_MAX_INPUT_CHARS, DEFAULT_MAX_NEW_TOKENS, DEFAULT_TEMPERATURE, DEFAULT_TOP_P, GENERATION_MAX_OUTPUT_CHARS, GENERATION_MAX_SOURCE_ITEMS
from python_ai.guardrails import clamp_confidence, compact_text, coerce_sources, extract_json_candidate, normalize_generation_output, sources_to_context


@lru_cache(maxsize=2)
def load_chat_model(model_id: str, device: str, dtype: str):
    tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    if dtype == 'float16':
        torch_dtype = torch.float16
    elif dtype == 'bfloat16':
        torch_dtype = torch.bfloat16
    else:
        torch_dtype = torch.float32

    kwargs: dict[str, Any] = {
        'torch_dtype': torch_dtype,
        'low_cpu_mem_usage': True,
        'trust_remote_code': True
    }

    if device == 'cpu':
        kwargs['device_map'] = None
    else:
        kwargs['device_map'] = 'auto'

    model = AutoModelForCausalLM.from_pretrained(model_id, **kwargs)

    if device == 'cpu':
        model.to(torch.device('cpu'))

    model.eval()
    return tokenizer, model


def build_chat_prompt(prompt: str) -> str:
    system_message = (
        'You are a precise startup finance assistant. '
        'Use only the provided evidence. If evidence is insufficient, say so explicitly. '
        'Do not invent amounts, dates, vendors, or transaction identifiers.'
    )

    return f'SYSTEM: {system_message}\nUSER: {prompt}\nASSISTANT:'


def build_generation_prompt(*, query: str, context: str, sources: list[dict[str, Any]] | None) -> str:
    evidence_block = sources_to_context(sources)
    return (
        'Write a concise answer grounded only in the evidence below. '
        'If the evidence does not support a confident answer, return a refusal. '
        'Return strict JSON only with the keys answer, confidence, refusal, cited_transaction_ids, guardrail_reason.\n\n'
        f'Question: {query}\n\n'
        f'Context:\n{context[:DEFAULT_MAX_INPUT_CHARS]}\n\n'
        f'Evidence:\n{evidence_block}\n\n'
        'JSON:'
    )


def generate_text(*, query: str, context: str, sources: list[dict[str, Any]] | None, model_id: str | None, device: str, dtype: str, max_new_tokens: int, temperature: float, top_p: float) -> dict[str, Any]:
    resolved_model = model_id or DEFAULT_CHAT_MODEL
    started = perf_counter()
    tokenizer, model = load_chat_model(resolved_model, device, dtype if dtype != 'auto' else DEFAULT_DTYPE)
    cleaned_sources = coerce_sources(sources)[:GENERATION_MAX_SOURCE_ITEMS]

    prompt = build_generation_prompt(query=query, context=context, sources=cleaned_sources)
    chat_prompt = build_chat_prompt(prompt)
    inputs = tokenizer(chat_prompt, return_tensors='pt')

    if device != 'cpu' and torch.cuda.is_available():
        inputs = {key: value.to(model.device) for key, value in inputs.items()}
    else:
        inputs = {key: value.to('cpu') for key, value in inputs.items()}

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens or DEFAULT_MAX_NEW_TOKENS,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-5),
            top_p=top_p or DEFAULT_TOP_P,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id
        )

    generated_tokens = output_ids[0][inputs['input_ids'].shape[-1]:]
    raw_output = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()

    if not raw_output:
        raw_output = tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    parsed = extract_json_candidate(raw_output)
    normalized = normalize_generation_output(parsed, raw_output, cleaned_sources)
    answer = compact_text(normalized['answer'], GENERATION_MAX_OUTPUT_CHARS)

    latency_ms = round((perf_counter() - started) * 1000, 2)
    tokens_generated = int(generated_tokens.shape[-1]) if hasattr(generated_tokens, 'shape') else None

    if not answer:
        answer = 'Evidence was insufficient to generate a grounded answer.'

    confidence = clamp_confidence(normalized.get('confidence')) or 0.0
    refusal = bool(normalized.get('refusal'))

    return {
        'answer': answer,
        'model_id': resolved_model,
        'latency_ms': latency_ms,
        'prompt_chars': len(prompt),
        'tokens_generated': tokens_generated,
        'confidence': confidence,
        'refusal': refusal,
        'evidence_items': len(cleaned_sources),
        'guardrail_reason': normalized.get('guardrail_reason'),
        'cited_transaction_ids': normalized.get('cited_transaction_ids', [])
    }
