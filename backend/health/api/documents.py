"""Medical documents and lab history. Upload -> processing -> review -> confirmed; only
confirmed, included rows reach /labs."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from health.api.auth import require_token
from health.db import get_session
from health.engine import labs
from health.models import LabResult, MedicalDocument
from health.sources import documents as docs

router = APIRouter(dependencies=[Depends(require_token)])


def _result(r: LabResult) -> dict:
    a = labs.CATALOG.get(r.analyte)
    return {
        "id": r.id,
        "analyte": r.analyte,
        "known": a is not None,
        "label": a.name if a else r.name,
        "category": a.category if a else "Other",
        "name": r.name,
        "panel": r.panel,
        "date": r.date.isoformat() if r.date else None,
        "value": r.value,
        "value_text": r.value_text,
        "unit": r.unit,
        "ref_low": r.ref_low,
        "ref_high": r.ref_high,
        "ref_text": r.ref_text,
        "value_std": r.value_std,
        "unit_std": r.unit_std,
        "ref_low_std": r.ref_low_std,
        "ref_high_std": r.ref_high_std,
        "flag": r.flag,
        "flag_source": r.flag_source,
        "method": r.method,
        "issue": r.issue,
        "page": r.page,
        "included": r.included,
    }


def _doc(d: MedicalDocument, s: Session | None = None) -> dict:
    out = {
        "id": d.id,
        "uploaded_at": d.uploaded_at.isoformat() + "Z",
        "status": d.status,
        "error": d.error,
        "kind": d.kind,
        "title": d.title,
        "provider": d.provider,
        "collected_on": d.collected_on.isoformat() if d.collected_on else None,
        "summary": d.summary,
        "files": [{"name": f["name"], "mime": f["mime"], "size": f["size"]} for f in d.files],
        "model": d.model,
        "usage": d.usage,
    }
    if s is not None:
        rows = s.execute(
            select(LabResult).where(LabResult.document_id == d.id).order_by(LabResult.id)
        ).scalars()
        out["results"] = [_result(r) for r in rows]
        out["notes"] = d.notes or []
    return out


def _get(s: Session, doc_id: int) -> MedicalDocument:
    d = s.get(MedicalDocument, doc_id)
    if d is None:
        raise HTTPException(404, "no such document")
    return d


@router.post("/documents")
async def upload_document(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    s: Session = Depends(get_session),
) -> dict:
    """One PDF or several photos of one document. Reading takes a minute; poll the document."""
    parts = []
    total = 0
    for f in files:
        data = await f.read(docs.MAX_TOTAL_BYTES + 1)
        total += len(data)
        if total > docs.MAX_TOTAL_BYTES:
            raise HTTPException(413, "files must be under 25 MB in total")
        parts.append((f.filename or "document", (f.content_type or "").lower(), data))
    try:
        doc, created = docs.save_upload(s, parts)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    s.commit()
    if created:
        background.add_task(docs.process, doc.id)
    return {**_doc(doc), "duplicate": not created}


@router.get("/documents")
def list_documents(s: Session = Depends(get_session)) -> list[dict]:
    rows = s.execute(select(MedicalDocument).order_by(MedicalDocument.uploaded_at.desc())).scalars()
    out = []
    for d in rows:
        item = _doc(d)
        results = (
            s.execute(
                select(LabResult.flag).where(LabResult.document_id == d.id, LabResult.included)
            )
            .scalars()
            .all()
        )
        item["result_count"] = len(results)
        item["flagged_count"] = sum(1 for f in results if f not in (None, "normal"))
        out.append(item)
    return out


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, s: Session = Depends(get_session)) -> dict:
    return _doc(_get(s, doc_id), s)


class ResultPatch(BaseModel):
    included: bool | None = None
    value: float | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    analyte: str | None = None  # a catalog key, or "other"


@router.patch("/documents/{doc_id}/results/{result_id}")
def patch_result(
    doc_id: int, result_id: int, body: ResultPatch, s: Session = Depends(get_session)
) -> dict:
    """Fix what the model misread: drop a row, correct a number, unit, range or analyte.
    The standardized value and flag are recomputed from the corrected fields."""
    _get(s, doc_id)
    r = s.get(LabResult, result_id)
    if r is None or r.document_id != doc_id:
        raise HTTPException(404, "no such result")
    fields = body.model_dump(exclude_unset=True)
    if "included" in fields and fields["included"] is not None:
        r.included = fields["included"]
    for k in ("value", "unit", "ref_low", "ref_high"):
        if k in fields:
            setattr(r, k, fields[k])
    if "analyte" in fields and fields["analyte"]:
        if fields["analyte"] != "other" and fields["analyte"] not in labs.CATALOG:
            raise HTTPException(422, "unknown analyte")
        r.analyte = labs.analyte_id(fields["analyte"], r.name)
    if fields.keys() - {"included"}:
        key = r.analyte if r.analyte in labs.CATALOG else None
        std = labs.standardize(key, r.value, r.unit, r.ref_low, r.ref_high)
        r.value_std, r.unit_std = std.value, std.unit
        r.ref_low_std, r.ref_high_std = std.ref_low, std.ref_high
        r.method, r.issue = std.method[:120], std.issue
        if "value" in fields:
            r.value_text = None
        printed = r.flag if r.flag_source == "printed" and "value" not in fields else None
        r.flag, r.flag_source = labs.resolve_flag(
            printed, labs.flag_for(r.value, r.ref_low, r.ref_high)
        )
    return _result(r)


@router.post("/documents/{doc_id}/confirm")
def confirm_document(doc_id: int, s: Session = Depends(get_session)) -> dict:
    d = _get(s, doc_id)
    if d.status not in ("review", "confirmed"):
        raise HTTPException(409, f"the document is {d.status}")
    d.status = "confirmed"
    return _doc(d, s)


@router.post("/documents/{doc_id}/retry")
def retry_document(
    doc_id: int, background: BackgroundTasks, s: Session = Depends(get_session)
) -> dict:
    """Read the document again (after a failure, or to discard the review and start over)."""
    d = _get(s, doc_id)
    if d.status == "processing":
        raise HTTPException(409, "already reading it")
    d.status, d.error = "processing", None
    s.commit()
    background.add_task(docs.process, d.id)
    return _doc(d)


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, s: Session = Depends(get_session)) -> dict:
    d = _get(s, doc_id)
    s.query(LabResult).filter(LabResult.document_id == d.id).delete()
    docs.remove_files(d)
    s.delete(d)
    return {"deleted": doc_id}


def _confirmed(s: Session, analyte: str | None = None):
    q = (
        select(LabResult)
        .join(MedicalDocument, MedicalDocument.id == LabResult.document_id)
        .where(MedicalDocument.status == "confirmed", LabResult.included)
    )
    if analyte:
        q = q.where(LabResult.analyte == analyte)
    return s.execute(q.order_by(LabResult.date, LabResult.id)).scalars().all()


@router.get("/labs")
def labs_latest(s: Session = Depends(get_session)) -> dict:
    """The latest confirmed value of every analyte, with the one before it."""
    by: dict[str, list[LabResult]] = {}
    for r in _confirmed(s):
        by.setdefault(r.analyte, []).append(r)
    markers = []
    for rows in by.values():
        latest = _result(rows[-1])
        prev = rows[-2] if len(rows) > 1 else None
        latest["count"] = len(rows)
        latest["previous"] = (
            {
                "date": prev.date.isoformat() if prev.date else None,
                "value_std": prev.value_std,
                "value": prev.value,
            }
            if prev
            else None
        )
        markers.append(latest)
    order = {c: i for i, c in enumerate(labs.CATEGORIES)}
    markers.sort(key=lambda m: (order.get(m["category"], 99), m["label"].lower()))
    flagged = sum(1 for m in markers if m["flag"] not in (None, "normal"))
    return {"markers": markers, "categories": labs.CATEGORIES, "flagged": flagged}


@router.get("/labs/{analyte}")
def lab_history(analyte: str, s: Session = Depends(get_session)) -> dict:
    a = labs.CATALOG.get(analyte)
    rows = _confirmed(s, analyte)
    if not rows and a is None:
        raise HTTPException(404, "no results for this marker")
    return {
        "analyte": analyte,
        "label": a.name if a else rows[-1].name,
        "category": a.category if a else "Other",
        "unit": a.unit if a else rows[-1].unit,
        "results": [{**_result(r), "document_id": r.document_id} for r in rows],
    }
