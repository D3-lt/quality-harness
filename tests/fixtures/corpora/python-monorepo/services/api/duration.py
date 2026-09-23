def parse(text):
    value = int(text)
    if value < 0:
        raise ValueError(text)
    return value
