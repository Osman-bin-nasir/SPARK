# SPARK Python AI Service

This service provides local model-backed embeddings and answer generation for SPARK.

## Default models

- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`
- Generation: `Qwen/Qwen2.5-1.5B-Instruct`

## Run

```bash
cd server
python -m pip install -r python_ai/requirements.txt
python -m uvicorn python_ai.app:app --host 0.0.0.0 --port 8001 --reload
```

## Endpoints

- `GET /health`
- `POST /embed`
- `POST /generate`

## Notes

- Models download from Hugging Face on first run.
- The generation endpoint is the local sLLM path used by the Node RAG service.
