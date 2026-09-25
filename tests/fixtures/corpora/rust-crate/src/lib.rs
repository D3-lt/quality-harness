/// Names the kind of quote a character is.
pub fn quote_kind(c: char) -> &'static str {
    match c {
        '\'' => "single",
        '"' => "double",
        _ => "none",
    }
}
