from typing import Any

from pydantic import BaseModel, Field


class EmbedRequest(BaseModel):
    input: str | list[str] = Field(..., description='Text or list of texts to embed')
    model_id: str | None = Field(default=None)
    device: str = Field(default='cpu')


class EmbedResponse(BaseModel):
    embedding: list[float] | list[list[float]]
    model_id: str
    latency_ms: float
    dimensions: int


class GenerateSource(BaseModel):
    transaction_id: str | None = None
    document_id: str | None = None
    vendor: str | None = None
    category: str | None = None
    amount: float | None = None
    transaction_date: str | None = None
    similarity_score: float | None = None
    extracted_text: str | None = None
    text_content: str | None = None


class GenerateRequest(BaseModel):
    prompt: str | None = Field(default=None)
    query: str | None = Field(default=None)
    context: str | None = Field(default=None)
    sources: list[GenerateSource] | None = Field(default=None)
    model_id: str | None = Field(default=None)
    device: str = Field(default='cpu')
    dtype: str = Field(default='auto')
    max_new_tokens: int = Field(default=256, ge=1, le=1024)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, gt=0.0, le=1.0)


class GenerateResponse(BaseModel):
    answer: str
    model_id: str
    latency_ms: float
    prompt_chars: int
    tokens_generated: int | None = None
    confidence: float | None = None
    refusal: bool = False
    evidence_items: int | None = None
    guardrail_reason: str | None = None
    cited_transaction_ids: list[str] = Field(default_factory=list)


class OcrPage(BaseModel):
    page_number: int
    text: str
    confidence: float | None = None
    method: str


class OcrExtractRequest(BaseModel):
    file_name: str | None = None
    mime_type: str | None = None
    file_base64: str
    fallback_text: str | None = None
    language: str | None = None
    max_pages: int | None = Field(default=None, ge=1, le=50)


class OcrExtractResponse(BaseModel):
    text: str
    confidence: float | None
    method: str
    version: str | None = None
    language: str | None = None
    page_count: int | None = None
    pages: list[OcrPage] = Field(default_factory=list)
    word_count: int | None = None
    extraction_error: str | None = None
