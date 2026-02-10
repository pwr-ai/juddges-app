def get_leaf_values(d: dict) -> list:
    """
    Get all leaf values from a nested dictionary.

    Args:
        d (dict): The dictionary to extract values from

    Returns:
        list: List of all leaf values
    """
    values: list = []

    for v in d.values():
        if isinstance(v, dict):
            values.extend(get_leaf_values(v))
        else:
            values.append(v)

    return values
