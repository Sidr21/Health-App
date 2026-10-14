"""Medical documents: unit standardization, the Claude request, and the upload -> review ->
confirm flow. The model is faked; every value here is synthetic."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from health.engine import labs
from health.sources import documents as docs

AUTH = {"Authorization": "Bearer testtoken"}
PDF_BYTES = b"%PDF-1.4 synthetic test document"


# ---- engine ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "printed,normal",
    [
        ("mg/dL", "mg/dl"),
        ("mg %", "mg/dl"),
        ("µmol/L", "umol/l"),
        ("mIU/L", "uiu/ml"),
        ("μIU/mL", "uiu/ml"),
        ("cells/cumm", "/ul"),
        ("x10³/µL", "10^3/ul"),
        ("10^9/L", "10^3/ul"),
        ("103/uL", "10^3/ul"),  # superscript lost in the PDF text
        ("Lakhs/cumm", "lakh/ul"),
        ("mill/cumm", "10^6/ul"),
        ("10^12/L", "10^6/ul"),
        ("mm/1st hr", "mm/h"),
        ("mL/min/1.73m²", "ml/min/1.73m2"),
        (None, ""),
    ],
)
def test_units_normalize(printed, normal):
    assert labs.norm_unit(printed) == normal


def test_conversions_to_canonical_units():
    ldl = labs.standardize("ldl", 3.0, "mmol/L", None, 2.6)
    assert ldl.unit == "mg/dL" and ldl.value == pytest.approx(116.0, abs=0.1)
    assert ldl.ref_high == pytest.approx(100.5, abs=0.1) and "38.67" in ldl.method
    assert labs.standardize("hba1c", 42, "mmol/mol").value == pytest.approx(5.99, abs=0.01)
    assert labs.standardize("platelets", 2.4, "Lakhs/cumm", 1.5, 4.0).value == pytest.approx(240)
    assert labs.standardize("wbc", 6100, "cells/cumm").value == pytest.approx(6.1)
    assert labs.standardize("vitamin_d_25oh", 60, "nmol/L").value == pytest.approx(24.04, abs=0.01)
    assert labs.standardize("creatinine", 88.4, "µmol/L").value == pytest.approx(1.0)
    assert labs.standardize("testosterone_total", 20, "nmol/L").value == pytest.approx(576.8)
    assert labs.standardize("hemoglobin", 140, "g/L").value == pytest.approx(14.0)
    same = labs.standardize("tsh", 2.1, "mIU/L")
    assert same.value == 2.1 and same.method == "as printed"


def test_unconvertible_and_implausible_values_are_called_out():
    bad = labs.standardize("ldl", 100, "furlongs")
    assert bad.value is None and "not one we can convert" in bad.issue
    misread = labs.standardize("hemoglobin", 1420, "g/dL")
    assert misread.value == 1420 and "outside what a person can have" in misread.issue
    other = labs.standardize(None, 3.0, "/hpf")
    assert other.value == 3.0 and other.unit == "/hpf" and "not in catalog" in other.method
    assert labs.standardize("tc_hdl_ratio", 3.5, None).value == 3.5  # ratios have no unit


def test_flags_prefer_the_labs_own():
    assert labs.flag_for(5, 10, 20) == "low"
    assert labs.flag_for(25, 10, 20) == "high"
    assert labs.flag_for(15, 10, 20) == "normal"
    assert labs.flag_for(150, None, 200) == "normal"
    assert labs.flag_for(15, None, None) is None
    assert labs.resolve_flag("high", "normal") == ("high", "printed")
    assert labs.resolve_flag(None, "low") == ("low", "range")
    assert labs.resolve_flag(None, None) == (None, "none")


def test_dedupe_keeps_the_row_with_a_range():
    rows = [
        {"analyte": "ldl", "value": 120.0, "value_text": None, "ref_low": None, "ref_high": None},
        {"analyte": "hdl", "value": 50.0, "value_text": None, "ref_low": 40, "ref_high": None},
        {"analyte": "ldl", "value": 120.0, "value_text": None, "ref_low": None, "ref_high": 100},
        {"analyte": "ldl", "value": 95.0, "value_text": None, "ref_low": None, "ref_high": 100},
    ]
    out = labs.dedupe(rows)
    assert [(r["analyte"], r["value"]) for r in out] == [
        ("ldl", 120.0),
        ("hdl", 50.0),
        ("ldl", 95.0),
    ]
    assert out[0]["ref_high"] == 100


def test_analyte_ids():
    assert labs.analyte_id("ldl", "LDL Cholesterol, Direct") == "ldl"
    assert labs.analyte_id(None, "Pus Cells (Urine)") == "other:pus_cells_urine"
    assert labs.analyte_id("not_a_key", "Thing") == "other:thing"


# ---- the request to Claude ---------------------------------------------------------------


def _walk(node, seen):
    if isinstance(node, dict):
        seen.append(node)
        for v in node.values():
            _walk(v, seen)
    elif isinstance(node, list):
        for v in node:
            _walk(v, seen)
    return seen


def test_schema_fits_structured_outputs():
    for node in _walk(docs.SCHEMA, []):
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert sorted(node["required"]) == sorted(node["properties"])
        for k in ("minimum", "maximum", "minLength", "maxLength", "minItems", "pattern"):
            assert k not in node
    keys = docs.SCHEMA["properties"]["results"]["items"]["properties"]["analyte_key"]["enum"]
    assert "ldl" in keys and "other" in keys


def test_request_for_a_pdf_and_for_photos():
    req = docs.build_request([("application/pdf", PDF_BYTES)], "claude-opus-5-5", "medium")
    blocks = req["messages"][0]["content"]
    assert (
        blocks[0]["type"] == "document" and blocks[0]["source"]["media_type"] == "application/pdf"
    )
    assert blocks[-1]["type"] == "text"
    assert req["output_config"]["effort"] == "medium"
    assert req["output_config"]["format"]["type"] == "json_schema"
    assert req["model"] == "claude-opus-5-5" and req["max_tokens"] >= 16000
    photos = docs.build_request([("image/jpeg", b"a"), ("image/png", b"b")], "m", "low")
    kinds = [b["type"] for b in photos["messages"][0]["content"]]
    assert kinds == ["image", "image", "text", "text"]
    assert "2 photos" in photos["messages"][0]["content"][2]["text"]


def test_upload_checks():
    with pytest.raises(ValueError, match="PDF or a JPEG"):
        docs.check_upload([("a.docx", "application/msword", b"x")])
    with pytest.raises(ValueError, match="one PDF at a time"):
        docs.check_upload([("a.pdf", "application/pdf", b"x"), ("b.jpg", "image/jpeg", b"y")])
    with pytest.raises(ValueError, match="under 5 MB"):
        docs.check_upload([("a.jpg", "image/jpeg", b"x" * (docs.MAX_IMAGE_BYTES + 1))])
    docs.check_upload([("p1.jpg", "image/jpeg", b"x"), ("p2.jpg", "image/jpeg", b"y")])


def _message(text: str, stop_reason: str = "end_turn"):
    return SimpleNamespace(
        model="claude-opus-5-5",
        stop_reason=stop_reason,
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text=text),
        ],
        usage=SimpleNamespace(input_tokens=1000, output_tokens=200),
    )


class _FakeAnthropic:
    reply = None
    last_request = None

    def __init__(self, **_):
        self.messages = self

    def stream(self, **req):
        _FakeAnthropic.last_request = req
        reply = _FakeAnthropic.reply

        class _S:
            def __enter__(self):
                return SimpleNamespace(get_final_message=lambda: reply)

            def __exit__(self, *a):
                return False

        return _S()


def test_extract_handles_answers_refusals_and_missing_keys(monkeypatch):
    import anthropic

    from health.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", None)
    with pytest.raises(docs.ExtractionError, match="ANTHROPIC_API_KEY"):
        docs.extract([("application/pdf", PDF_BYTES)])

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(anthropic, "Anthropic", _FakeAnthropic)
    _FakeAnthropic.reply = _message(SAMPLE.model_dump_json())
    x, meta = docs.extract([("application/pdf", PDF_BYTES)])
    assert x.document.provider == "Example Diagnostics" and meta["usage"]["input_tokens"] == 1000
    assert _FakeAnthropic.last_request["model"] == settings.documents_model

    _FakeAnthropic.reply = _message("", "refusal")
    with pytest.raises(docs.ExtractionError, match="declined"):
        docs.extract([("application/pdf", PDF_BYTES)])
    _FakeAnthropic.reply = _message('{"document":', "max_tokens")
    with pytest.raises(docs.ExtractionError, match="too long"):
        docs.extract([("application/pdf", PDF_BYTES)])
    _FakeAnthropic.reply = _message('{"not": "the schema"}')
    with pytest.raises(docs.ExtractionError, match="expected shape"):
        docs.extract([("application/pdf", PDF_BYTES)])


# ---- upload -> review -> confirm ---------------------------------------------------------


def _r(
    name, key, value, unit, lo=None, hi=None, flag=None, text=None, date=None, page=1, panel=None
):
    return docs.XResult(
        panel=panel, name=name, analyte_key=key, value=value, value_text=text, unit=unit,
        ref_low=lo, ref_high=hi, ref_text=None, flag=flag, date=date, page=page,
    )  # fmt: skip


SAMPLE = docs.Extraction(
    document=docs.XDocument(
        kind="lab_report",
        title="Annual panel",
        provider="Example Diagnostics",
        collected_on="2026-03-02",
        reported_on="2026-03-03",
        summary="A routine panel. LDL is flagged high.",
    ),
    results=[
        _r("LDL Cholesterol", "ldl", 3.4, "mmol/L", None, 3.0, "high", panel="Lipid profile"),
        _r("HDL Cholesterol", "hdl", 1.3, "mmol/L", 1.0, None, panel="Lipid profile"),
        _r("HbA1c", "hba1c", 5.3, "%", 4.0, 5.6),
        _r("Platelet count", "platelets", 2.2, "Lakhs/cumm", 1.5, 4.1, page=2),
        _r("Vitamin D, 25-hydroxy", "vitamin_d_25oh", 18, "ng/mL", 30, 100, page=3),
        _r("Pus cells", "other", None, "/hpf", text="2-3", page=4, panel="Urine routine"),
        _r("LDL Cholesterol", "ldl", 3.4, "mmol/L", page=5),  # repeated on a summary page
        _r("LDL Cholesterol", "ldl", 3.9, "mmol/L", None, 3.0, date="2025-03-01", page=5),
    ],
    notes=[docs.XNote(title="Comment", text="Repeat the lipid panel in three months.")],
)


@pytest.fixture
def client(tmp_db, monkeypatch):
    from health.api.main import app

    calls = []

    def fake_extract(files):
        calls.append(files)
        return fake_extract.result, {
            "model": "claude-opus-5-5",
            "usage": {"input_tokens": 9, "output_tokens": 9},
        }

    fake_extract.result = SAMPLE
    monkeypatch.setattr(docs, "extract", fake_extract)
    with TestClient(app) as c:
        c.calls = calls
        c.fake = fake_extract
        yield c


def _upload(c, data=PDF_BYTES, name="report.pdf", mime="application/pdf"):
    return c.post("/documents", headers=AUTH, files=[("files", (name, data, mime))])


def test_upload_reads_and_holds_for_review(client):
    r = _upload(client)
    assert r.status_code == 200, r.text
    assert r.json()["duplicate"] is False
    doc_id = r.json()["id"]
    d = client.get(f"/documents/{doc_id}", headers=AUTH).json()
    assert d["status"] == "review" and d["provider"] == "Example Diagnostics"
    assert d["collected_on"] == "2026-03-02" and d["notes"][0]["title"] == "Comment"
    by = {(x["analyte"], x["date"]): x for x in d["results"]}
    assert len(d["results"]) == 7  # the summary-page repeat of LDL is dropped
    ldl = by[("ldl", "2026-03-02")]
    assert ldl["value_std"] == pytest.approx(131.5, abs=0.1) and ldl["unit_std"] == "mg/dL"
    assert (
        ldl["flag"] == "high"
        and ldl["flag_source"] == "printed"
        and ldl["ref_high_std"] == pytest.approx(116.0, abs=0.1)
    )
    assert by[("ldl", "2025-03-01")]["value_std"] == pytest.approx(150.8, abs=0.1)
    assert by[("platelets", "2026-03-02")]["value_std"] == pytest.approx(220)
    vitd = by[("vitamin_d_25oh", "2026-03-02")]
    assert vitd["flag"] == "low" and vitd["flag_source"] == "range"
    pus = by[("other:pus_cells", "2026-03-02")]
    assert pus["value_text"] == "2-3" and pus["category"] == "Other" and pus["flag"] is None
    # nothing reaches the history until confirmed
    assert client.get("/labs", headers=AUTH).json()["markers"] == []
    listed = client.get("/documents", headers=AUTH).json()
    assert listed[0]["result_count"] == 7 and listed[0]["flagged_count"] == 3


def test_same_file_twice_is_one_document(client):
    first = _upload(client).json()
    again = _upload(client, name="renamed.pdf").json()
    assert again["id"] == first["id"] and again["duplicate"] is True
    assert len(client.calls) == 1


def test_review_edits_then_confirm_feeds_history(client):
    doc_id = _upload(client).json()["id"]
    results = client.get(f"/documents/{doc_id}", headers=AUTH).json()["results"]
    by = {(x["analyte"], x["date"]): x for x in results}
    pus = by[("other:pus_cells", "2026-03-02")]
    r = client.patch(
        f"/documents/{doc_id}/results/{pus['id']}", headers=AUTH, json={"included": False}
    )
    assert r.json()["included"] is False
    # the reviewer corrects a misread HDL: 1.3 was really 1.1 mmol/L
    hdl = by[("hdl", "2026-03-02")]
    fixed = client.patch(
        f"/documents/{doc_id}/results/{hdl['id']}", headers=AUTH, json={"value": 1.1}
    ).json()
    assert fixed["value_std"] == pytest.approx(42.5, abs=0.1) and fixed["flag"] == "normal"
    bad = client.patch(
        f"/documents/{doc_id}/results/{hdl['id']}", headers=AUTH, json={"analyte": "nope"}
    )
    assert bad.status_code == 422

    confirmed = client.post(f"/documents/{doc_id}/confirm", headers=AUTH).json()
    assert confirmed["status"] == "confirmed"
    latest = client.get("/labs", headers=AUTH).json()
    keys = [m["analyte"] for m in latest["markers"]]
    assert "other:pus_cells" not in keys
    assert keys.index("hba1c") < keys.index("ldl") < keys.index("vitamin_d_25oh")  # by category
    ldl = next(m for m in latest["markers"] if m["analyte"] == "ldl")
    assert ldl["date"] == "2026-03-02" and ldl["count"] == 2
    assert ldl["previous"]["date"] == "2025-03-01"
    hist = client.get("/labs/ldl", headers=AUTH).json()
    assert hist["unit"] == "mg/dL" and [x["date"] for x in hist["results"]] == [
        "2025-03-01",
        "2026-03-02",
    ]
    assert client.get("/labs/not_measured_here", headers=AUTH).status_code == 404


def test_failures_are_retryable_and_delete_removes_files(client):
    from health.config import settings

    def broken(files):
        raise docs.ExtractionError("The Anthropic API is rate limiting; retry in a minute.")

    good = client.fake
    docs.extract = broken  # restored by monkeypatch at teardown
    doc_id = _upload(client, data=b"%PDF-1.4 another synthetic file").json()["id"]
    d = client.get(f"/documents/{doc_id}", headers=AUTH).json()
    assert d["status"] == "failed" and "rate limiting" in d["error"]
    assert client.post(f"/documents/{doc_id}/confirm", headers=AUTH).status_code == 409

    docs.extract = good
    assert client.post(f"/documents/{doc_id}/retry", headers=AUTH).status_code == 200
    assert client.get(f"/documents/{doc_id}", headers=AUTH).json()["status"] == "review"

    stored = list(settings.documents_dir.iterdir())
    assert len(stored) == 1
    assert client.delete(f"/documents/{doc_id}", headers=AUTH).json() == {"deleted": doc_id}
    assert list(settings.documents_dir.iterdir()) == []
    assert client.get(f"/documents/{doc_id}", headers=AUTH).status_code == 404


def test_bad_uploads_are_refused(client):
    r = _upload(client, data=b"hello", name="notes.txt", mime="text/plain")
    assert r.status_code == 422 and "PDF" in r.json()["detail"]
    assert (
        client.post(
            "/documents", files=[("files", ("a.pdf", PDF_BYTES, "application/pdf"))]
        ).status_code
        == 401
    )


def test_photos_of_one_document(client):
    r = client.post(
        "/documents",
        headers=AUTH,
        files=[
            ("files", ("p1.jpg", b"\xff\xd8 page one", "image/jpeg")),
            ("files", ("p2.jpg", b"\xff\xd8 page two", "image/jpeg")),
        ],
    )
    assert r.status_code == 200, r.text
    assert [f["name"] for f in r.json()["files"]] == ["p1.jpg", "p2.jpg"]
    assert [m for m, _ in client.calls[-1]] == ["image/jpeg", "image/jpeg"]


def test_restart_marks_unfinished_documents_retryable(tmp_db):
    from health.db import session_scope
    from health.models import MedicalDocument

    with session_scope() as s:
        doc, _ = docs.save_upload(s, [("a.pdf", "application/pdf", PDF_BYTES)])
        doc_id = doc.id
    assert docs.recover_interrupted() == 1
    with session_scope() as s:
        d = s.get(MedicalDocument, doc_id)
        assert d.status == "failed" and "restart" in d.error
