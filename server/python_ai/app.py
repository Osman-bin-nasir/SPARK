from base64 import b64decode
from binascii import Error as BinasciiError
from functools import lru_cache
from time import perf_counter

from fastapi import FastAPI, HTTPException
from sentence_transformers import SentenceTransformer

from python_ai.config import DEFAULT_CHAT_MODEL, DEFAULT_DEVICE, DEFAULT_DTYPE, DEFAULT_EMBED_MODEL
from python_ai.generation import generate_text
from python_ai.ocr import OcrEngineUnavailable, extract_document
from python_ai.schemas import EmbedRequest, EmbedResponse, GenerateRequest, GenerateResponse, OcrExtractRequest, OcrExtractResponse

app = FastAPI(title='SPARK Python AI', version='2.0.0')


@lru_cache(maxsize=4)
def load_embedding_model(model_id: str) -> SentenceTransformer:
    return SentenceTransformer(model_id)


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/extract', response_model=OcrExtractResponse)
def extract(request: OcrExtractRequest):
    try:
        raw_bytes = b64decode(request.file_base64, validate=True)
        result = extract_document(request.file_name, request.mime_type, raw_bytes, request.fallback_text)
        return {
            'text': result.text,
            'confidence': result.confidence,
            'method': result.method,
            'version': result.version,
            'language': result.language,
            'page_count': result.page_count,
            'pages': [page.__dict__ for page in result.pages],
            'word_count': result.word_count,
            'extraction_error': result.extraction_error,
            'extraction_fields': result.extraction_fields
        }
    except OcrEngineUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except BinasciiError as exc:
        raise HTTPException(status_code=400, detail=f'Invalid base64 payload: {exc}') from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'OCR extraction failed: {exc}') from exc


@app.post('/embed', response_model=EmbedResponse)
def embed(request: EmbedRequest):
    model_id = request.model_id or DEFAULT_EMBED_MODEL
    started = perf_counter()

    try:
        model = load_embedding_model(model_id)
        texts = [request.input] if isinstance(request.input, str) else request.input
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False
        )
        result = embeddings.tolist() if isinstance(request.input, list) else embeddings[0].tolist()
        latency_ms = round((perf_counter() - started) * 1000, 2)
        return {'embedding': result, 'model_id': model_id, 'latency_ms': latency_ms, 'dimensions': len(result)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Embedding generation failed: {exc}') from exc


@app.post('/generate', response_model=GenerateResponse)
def generate(request: GenerateRequest):
    try:
        response = generate_text(
            prompt=request.prompt,
            query=(request.query or '').strip(),
            context=(request.context or '').strip(),
            sources=[source.model_dump() for source in request.sources] if request.sources else None,
            model_id=request.model_id or DEFAULT_CHAT_MODEL,
            device=request.device or DEFAULT_DEVICE,
            dtype=request.dtype or DEFAULT_DTYPE,
            max_new_tokens=request.max_new_tokens,
            temperature=request.temperature,
            top_p=request.top_p
        )
        return response
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Generation failed: {exc}') from exc
