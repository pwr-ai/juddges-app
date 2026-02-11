import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), "../packages/juddges_search"))

from juddges_search.models import LegalDocument, DocumentType

def test_extensibility():
    try:
        doc = LegalDocument(
            document_id="test-1",
            document_type=DocumentType.JUDGMENT,
            full_text="test text",
            country="PL",
            # Extra field
            extra_field="This should be allowed",
            victims_count=5
        )
        print("Model instantiated successfully with extra fields.")
        if "extra_field" in doc.model_dump():
            print(f"Extra field in dump: {doc.model_dump()['extra_field']}")
            print(f"Victims count: {doc.victims_count}")
            return True
        else:
            print("Extra field NOT found in model_dump()")
            return False
    except Exception as e:
        print(f"Model validation failed: {e}")
        return False

if __name__ == "__main__":
    success = test_extensibility()
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
