// Every shape ahead of the tests is one that once hid the tests after it from a
// reader that took each `'` for a string opener: a lifetime, a raw lifetime, a
// loop label, char literals holding a quote, and a raw string holding one. The
// single `&'static` leaves that reader's quotes unpaired, so its "string" runs on
// into the first test (BACKLOG §276).
use scanner::quote_kind;

const SINGLE: char = '\'';
const DOUBLE: char = '"';
const OPEN: char = '{';
const RAW: &str = r#"say "hi" and {"#;

struct Case<'a> {
    text: &'a str,
}

fn longest<'r#a>(left: &'r#a str, right: &'r#a str) -> &'r#a str {
    if left.len() >= right.len() { left } else { right }
}

fn kind_of(c: char) -> &'static str {
    quote_kind(c)
}

fn first_open(text: &str) -> Option<usize> {
    let mut found = None;
    'outer: for (i, c) in text.chars().enumerate() {
        if c == OPEN {
            found = Some(i);
            break 'outer;
        }
    }
    found
}

#[test]
fn a_single_quote_is_classified() {
    // A reader that took the lifetime's quote for a string ran on to the next
    // apostrophe: this comment's.
    assert_eq!(kind_of(SINGLE), "single");
    assert_eq!(kind_of(DOUBLE), "double");
}

#[test]
fn a_raw_string_keeps_its_quotes() {
    let case = Case { text: RAW };
    assert_eq!(longest(case.text, "x"), RAW);
    assert_eq!(first_open(case.text), Some(13));
}
