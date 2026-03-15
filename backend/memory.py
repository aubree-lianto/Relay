"""Moorcheh semantic memory for agentic triage context.

Stores past triage cases and retrieves similar ones to inform the agent.
Uses Moorcheh's ITS (Information-Theoretic Score) for high-accuracy semantic search.
Gracefully degrades when MOORCHEH_API_KEY is not set.
"""

import os
import time
import uuid
from typing import Any

NAMESPACE = "paramedic-triage-memory"

_client = None


def _get_client():
    """Lazy-init Moorcheh client. Returns None if no API key."""
    global _client
    if _client is not None:
        return _client
    api_key = os.getenv("MOORCHEH_API_KEY")
    if not api_key:
        return None
    try:
        from moorcheh_sdk import MoorchehClient
        _client = MoorchehClient(api_key=api_key)
        return _client
    except ImportError:
        return None


def _ensure_namespace() -> bool:
    """Ensure the triage memory namespace exists. Returns False if Moorcheh unavailable."""
    client = _get_client()
    if not client:
        return False
    try:
        with client:
            ns_list = client.namespaces.list()
            names = [n.get("namespace_name") or n.get("name") for n in (ns_list or [])]
            if NAMESPACE not in names:
                client.namespaces.create(namespace_name=NAMESPACE, type="text")
        return True
    except Exception:
        return False


def store_triage_case(
    patient_id: str,
    transcript: str,
    chief_complaint: str | None,
    ctas: int,
    problem_code: str | None,
    vitals_summary: str,
    remarks: str | None = None,
) -> bool:
    """Store a completed triage case in semantic memory for future retrieval."""
    client = _get_client()
    if not client or not _ensure_namespace():
        return False

    doc_text = f"""Paramedic triage case:
Transcript: {transcript}
Chief complaint: {chief_complaint or "unknown"}
CTAS level: {ctas}
Problem code: {problem_code or "N/A"}
Vitals: {vitals_summary}
Remarks: {remarks or "—"}
"""
    doc_id = str(uuid.uuid4())
    try:
        with client:
            client.documents.upload(
                namespace_name=NAMESPACE,
                documents=[{"id": doc_id, "text": doc_text}],
            )
        return True
    except Exception:
        return False


def get_similar_cases(query: str, top_k: int = 3) -> list[str]:
    """Retrieve similar past triage cases for context. Returns list of case text snippets."""
    client = _get_client()
    if not client or not _ensure_namespace():
        return []

    try:
        with client:
            res = client.similarity_search.query(
                namespaces=[NAMESPACE],
                query=query,
                top_k=top_k,
            )
        matches = res.get("matches") or res.get("results") or []
        # Allow a brief moment for indexing on first upload
        if not matches and top_k > 0:
            time.sleep(1)
            with client:
                res = client.similarity_search.query(
                    namespaces=[NAMESPACE],
                    query=query,
                    top_k=top_k,
                )
            matches = res.get("matches") or res.get("results") or []

        texts = []
        for m in matches:
            t = m.get("text") or m.get("content") or m.get("source", "")
            if t and isinstance(t, str):
                texts.append(t)
        return texts
    except Exception:
        return []
