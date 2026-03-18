import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), "../packages/juddges_search"))

from juddges_search.models import DocumentType, LegalDocument


def test_extensibility():
    doc = LegalDocument(
        document_id="test-1",
        document_type=DocumentType.JUDGMENT,
        full_text="test text",
        country="PL",
        # Extra field
        extra_field="This should be allowed",
        victims_count=5,
    )

    dumped = doc.model_dump()
    assert dumped["extra_field"] == "This should be allowed"
    assert doc.victims_count == 5


if __name__ == "__main__":
    success = test_extensibility()
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
