"""Uploaded medical documents: store the files, have Claude read them into structured rows,
standardize the numbers (engine/labs.py), and hold them for the user's review.

Why a model: reports come from any lab, in any layout, as PDFs or phone photos, with units and
range conventions that vary by country. A model finds the rows; plain code does the units,
flags and storage, and nothing counts until the user confirms it.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from health.config import settings
from health.db import session_scope
from health.engine import labs
from health.models import LabResult, MedicalDocument

log = logging.getLogger(__name__)

PDF = "application/pdf"
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
EXT = {
    PDF: ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_TOTAL_BYTES = 25 * 1024 * 1024  # the API takes 32 MB per request, base64 adds a third
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # the API's per-image limit

KINDS = [
    "lab_report",
    "doctor_note",
    "imaging_report",
    "discharge_summary",
    "prescription",
    "other",
]


class ExtractionError(Exception):
    """The document could not be read; the message is shown to the user."""


# ---- what the model returns -------------------------------------------------------------


class XDocument(BaseModel):
    kind: Literal[
        "lab_report", "doctor_note", "imaging_report", "discharge_summary", "prescription", "other"
    ]
    title: str | None
    provider: str | None
    collected_on: str | None
    reported_on: str | None
    summary: str


class XResult(BaseModel):
    panel: str | None
    name: str
    analyte_key: str
    value: float | None
    value_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    ref_text: str | None
    flag: str | None
    date: str | None
    page: int | None


class XNote(BaseModel):
    title: str
    text: str


class Extraction(BaseModel):
    document: XDocument
    results: list[XResult]
    notes: list[XNote]


def _nullable(t: str) -> dict:
    return {"anyOf": [{"type": t}, {"type": "null"}]}


def _obj(props: dict) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": list(props),
        "additionalProperties": False,
    }


SCHEMA = _obj(
    {
        "document": _obj(
            {
                "kind": {"type": "string", "enum": KINDS},
                "title": _nullable("string"),
                "provider": _nullable("string"),
                "collected_on": _nullable("string"),
                "reported_on": _nullable("string"),
                "summary": {"type": "string"},
            }
        ),
        "results": {
            "type": "array",
            "items": _obj(
                {
                    "panel": _nullable("string"),
                    "name": {"type": "string"},
                    "analyte_key": {"type": "string", "enum": [*labs.KEYS, "other"]},
                    "value": _nullable("number"),
                    "value_text": _nullable("string"),
                    "unit": _nullable("string"),
                    "ref_low": _nullable("number"),
                    "ref_high": _nullable("number"),
                    "ref_text": _nullable("string"),
                    "flag": {
                        "anyOf": [{"type": "string", "enum": list(labs.FLAGS)}, {"type": "null"}]
                    },
                    "date": _nullable("string"),
                    "page": _nullable("integer"),
                }
            ),
        },
        "notes": {
            "type": "array",
            "items": _obj({"title": {"type": "string"}, "text": {"type": "string"}}),
        },
    }
)

SYSTEM = """You transcribe medical documents (lab reports, doctor's notes, imaging reports, \
discharge summaries, prescriptions) into JSON for the patient's own health app. The app \
converts units, compares against ranges and charts history itself, so your job is a faithful \
transcription, not interpretation.

Results (every measured value in the document):
- Report value, unit and reference range exactly as printed. Do not convert units, round, or \
compute anything.
- value is the number. For a result like "<0.5" or "Negative" or "Reactive", set value to \
null and put the printed text in value_text.
- ref_low / ref_high come from the printed range: "70-100" gives 70 and 100; "<200" gives \
only ref_high 200; ">40" gives only ref_low 40. When the range is a set of categories \
(e.g. desirable / borderline / high, or deficient / insufficient / sufficient), use the \
normal or desirable band for ref_low / ref_high and copy the full printed range into ref_text.
- flag is the lab's own marker (H, L, High, Low, *, bold "Abnormal", critical) mapped to the \
enum; null when the lab printed none. Never infer a flag yourself.
- analyte_key: the catalog key that is the same measurement (same specimen, same quantity). \
Blood serum/plasma tests only; urine and stool tests are "other". Use glucose_fasting only \
when the report says fasting; *_pct for differential percentages and *_abs for absolute \
counts. When unsure, use "other": a wrong key corrupts the history chart, "other" does not.
- name is the test name as printed; panel the section heading it sits under.
- If the same value is printed more than once (a summary page and the full report), list it \
once. If the report prints previous results alongside today's (a cumulative report), list \
each past value as its own row with its date.
- date (YYYY-MM-DD) only when the row's date differs from the document's collection date.
- page is the 1-based page (or image) the value is on.

Skip: generic interpretive text and education printed for every patient, method and \
accreditation notes, sample-handling notes, and patient identifiers (name, ID, address, \
phone). They are not needed.

Document: collected_on is the sample collection date (YYYY-MM-DD), else the visit or report \
date; reported_on the report date. provider is the lab, clinic or hospital. summary is two or \
three plain sentences: what the document is, and which results the lab flagged or which \
findings the clinician called out. No advice.

Notes: for doctor's notes, imaging and discharge documents, the content that is not a number: \
diagnoses, impressions, findings, medications with doses, and recommendations, each as a \
short title and a faithful text. For a lab report, only comments written about this patient."""

PROMPT = "Transcribe this document."


# ---- storage ------------------------------------------------------------------------------


def check_upload(files: list[tuple[str, str, bytes]]) -> None:
    """One PDF, or one or more images (pages of a paper document). Raises ValueError."""
    if not files:
        raise ValueError("no file")
    mimes = [m for _, m, _ in files]
    for name, mime, data in files:
        if mime != PDF and mime not in IMAGE_TYPES:
            raise ValueError(
                f"{name}: send a PDF or a JPEG/PNG/WebP photo (got {mime or 'unknown'})"
            )
        if mime in IMAGE_TYPES and len(data) > MAX_IMAGE_BYTES:
            raise ValueError(f"{name}: photos must be under 5 MB")
        if not data:
            raise ValueError(f"{name}: empty file")
    if PDF in mimes and len(files) > 1:
        raise ValueError("upload one PDF at a time, or several photos")
    if sum(len(d) for _, _, d in files) > MAX_TOTAL_BYTES:
        raise ValueError("files must be under 25 MB in total")


def save_upload(s: Session, files: list[tuple[str, str, bytes]]) -> tuple[MedicalDocument, bool]:
    """Store the files and a `processing` document; (document, created). A file uploaded
    before returns the existing document instead of a second copy."""
    check_upload(files)
    digest = hashlib.sha256()
    for _, _, data in files:
        digest.update(hashlib.sha256(data).digest())
    sha = digest.hexdigest()
    existing = s.execute(
        select(MedicalDocument).where(MedicalDocument.sha256 == sha)
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False
    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    stored = []
    for i, (name, mime, data) in enumerate(files):
        path = settings.documents_dir / f"{sha[:32]}-{i}{EXT[mime]}"
        path.write_bytes(data)
        stored.append({"name": name[:200], "path": path.name, "mime": mime, "size": len(data)})
    doc = MedicalDocument(
        uploaded_at=datetime.now(UTC).replace(tzinfo=None),
        sha256=sha,
        files=stored,
        status="processing",
        title=files[0][0][:200],
    )
    s.add(doc)
    s.flush()
    return doc, True


def file_paths(doc: MedicalDocument) -> list[Path]:
    return [settings.documents_dir / f["path"] for f in doc.files]


def remove_files(doc: MedicalDocument) -> None:
    for p in file_paths(doc):
        p.unlink(missing_ok=True)


# ---- the model call -----------------------------------------------------------------------


def build_request(files: list[tuple[str, bytes]], model: str, effort: str) -> dict:
    """Keyword arguments for messages.stream(): the files as document/image blocks."""
    blocks: list[dict] = []
    for mime, data in files:
        b64 = base64.standard_b64encode(data).decode()
        if mime == PDF:
            blocks.append(
                {"type": "document", "source": {"type": "base64", "media_type": PDF, "data": b64}}
            )
        else:
            blocks.append(
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
            )
    if len(files) > 1:
        blocks.append(
            {
                "type": "text",
                "text": f"These {len(files)} photos are the pages of one document, in order.",
            }
        )
    blocks.append({"type": "text", "text": PROMPT})
    return {
        "model": model,
        "max_tokens": 32000,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": blocks}],
        "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": SCHEMA}},
    }


def extract(files: list[tuple[str, bytes]]) -> tuple[Extraction, dict]:
    """Have Claude read the files. Returns the validated extraction and usage/model info."""
    import anthropic

    if not settings.anthropic_api_key:
        raise ExtractionError(
            "Reading documents needs an Anthropic API key: set ANTHROPIC_API_KEY on the server "
            "(fly secrets set ANTHROPIC_API_KEY=...)."
        )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=3, timeout=600)
    req = build_request(files, settings.documents_model, settings.documents_effort)
    try:
        with client.messages.stream(**req) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ExtractionError("The Anthropic API key was rejected; check ANTHROPIC_API_KEY.") from e
    except anthropic.RateLimitError as e:
        raise ExtractionError("The Anthropic API is rate limiting; retry in a minute.") from e
    except anthropic.BadRequestError as e:
        raise ExtractionError(f"The document could not be sent: {e.message}"[:480]) from e
    except anthropic.APIConnectionError as e:
        raise ExtractionError("Could not reach the Anthropic API; retry later.") from e
    except anthropic.APIStatusError as e:
        raise ExtractionError(f"The Anthropic API failed ({e.status_code}); retry later.") from e

    meta = {
        "model": msg.model,
        "usage": {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens},
    }
    if msg.stop_reason == "refusal":
        raise ExtractionError("The model declined to read this document.")
    if msg.stop_reason == "max_tokens":
        raise ExtractionError(
            "The document is too long to read in one pass; split it and upload the parts."
        )
    text = "".join(b.text for b in msg.content if b.type == "text")
    return parse_extraction(text), meta


def parse_extraction(text: str) -> Extraction:
    try:
        return Extraction.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as e:
        raise ExtractionError("The model's answer was not in the expected shape; retry.") from e


# ---- turning the extraction into rows -----------------------------------------------------


def _date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def result_rows(x: Extraction) -> list[dict]:
    """Standardize and flag every row (pure: Extraction in, dicts out)."""
    doc_day = _date(x.document.collected_on) or _date(x.document.reported_on)
    rows = []
    for r in x.results:
        key = r.analyte_key if r.analyte_key in labs.CATALOG else None
        std = labs.standardize(key, r.value, r.unit, r.ref_low, r.ref_high)
        computed = labs.flag_for(r.value, r.ref_low, r.ref_high)
        flag, flag_source = labs.resolve_flag(r.flag, computed)
        rows.append(
            {
                "analyte": labs.analyte_id(key, r.name),
                "name": r.name[:200],
                "panel": (r.panel or None) and r.panel[:200],
                "date": _date(r.date) or doc_day,
                "value": r.value,
                "value_text": r.value_text and r.value_text[:200],
                "unit": r.unit and r.unit[:40],
                "ref_low": r.ref_low,
                "ref_high": r.ref_high,
                "ref_text": r.ref_text and r.ref_text[:300],
                "value_std": std.value,
                "unit_std": std.unit,
                "ref_low_std": std.ref_low,
                "ref_high_std": std.ref_high,
                "flag": flag,
                "flag_source": flag_source,
                "method": std.method[:120],
                "issue": std.issue,
                "page": r.page,
            }
        )
    return labs.dedupe(rows)


def apply_extraction(s: Session, doc: MedicalDocument, x: Extraction, meta: dict) -> None:
    s.execute(delete(LabResult).where(LabResult.document_id == doc.id))
    d = x.document
    doc.kind = d.kind
    doc.title = (d.title or doc.title or "Document")[:200]
    doc.provider = d.provider and d.provider[:200]
    doc.collected_on = _date(d.collected_on) or _date(d.reported_on)
    doc.summary = d.summary[:2000]
    doc.notes = [n.model_dump() for n in x.notes]
    doc.model = meta.get("model")
    doc.usage = meta.get("usage")
    doc.extracted = x.model_dump()
    doc.status = "review"
    doc.error = None
    for row in result_rows(x):
        s.add(LabResult(document_id=doc.id, **row))


def process(doc_id: int) -> None:
    """Read one document (runs in the background after an upload or a retry)."""
    with session_scope() as s:
        doc = s.get(MedicalDocument, doc_id)
        if doc is None:
            return
        files = [
            (f["mime"], p.read_bytes()) for f, p in zip(doc.files, file_paths(doc), strict=True)
        ]
    try:
        x, meta = extract(files)
    except ExtractionError as e:
        _fail(doc_id, str(e))
        return
    except Exception as e:  # keep the document retryable whatever went wrong
        log.exception("document %s: extraction failed", doc_id)
        _fail(doc_id, f"Unexpected error: {type(e).__name__}")
        return
    with session_scope() as s:
        doc = s.get(MedicalDocument, doc_id)
        if doc is not None:  # deleted while it was being read
            apply_extraction(s, doc, x, meta)


def _fail(doc_id: int, message: str) -> None:
    with session_scope() as s:
        doc = s.get(MedicalDocument, doc_id)
        if doc is not None:
            doc.status = "failed"
            doc.error = message[:500]


def recover_interrupted() -> int:
    """Documents left `processing` by a restart can't finish: mark them retryable."""
    with session_scope() as s:
        docs = (
            s.execute(select(MedicalDocument).where(MedicalDocument.status == "processing"))
            .scalars()
            .all()
        )
        for d in docs:
            d.status = "failed"
            d.error = "Interrupted by a server restart; retry."
        return len(docs)
