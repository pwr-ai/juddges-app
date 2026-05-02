import pytest
from juddges_search.ingestion.batcher import batched


@pytest.mark.unit
def test_batched_yields_full_chunks():
    out = list(batched(range(7), size=3))
    assert out == [[0, 1, 2], [3, 4, 5], [6]]


@pytest.mark.unit
def test_batched_empty_input_yields_nothing():
    assert list(batched([], size=10)) == []


@pytest.mark.unit
def test_batched_single_full_chunk():
    out = list(batched([1, 2, 3], size=3))
    assert out == [[1, 2, 3]]


@pytest.mark.unit
def test_batched_size_must_be_positive():
    with pytest.raises(ValueError, match="size must be positive"):
        list(batched([1, 2], size=0))


@pytest.mark.unit
def test_batched_size_must_be_positive_negative():
    with pytest.raises(ValueError, match="size must be positive"):
        list(batched([1, 2], size=-1))
