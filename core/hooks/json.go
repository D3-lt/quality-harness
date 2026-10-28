// JSON with JavaScript's semantics, because every ledger row this core writes is read by plugin/scripts/*.mjs and every row it
// reads was written by them: objects keep their key order (JSON.stringify writes insertion order), numbers are float64, a
// missing key is not a null one, and strings are escaped the way JSON.stringify escapes them (no HTML escaping, U+2028 and
// U+2029 left as they are). ADR-110 Decision 1: a row either implementation writes, the other reads.
package hooks

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Obj is a JSON object in key order.
type Obj struct {
	keys []string
	vals map[string]any
}

// undefined is JavaScript's undefined: what a missing key reads as. It is never written.
type undefinedType struct{}

var undefined = undefinedType{}

// O builds an object from alternating keys and values, in that order. A value that is undefined is left out, as
// JSON.stringify leaves it out.
func O(kv ...any) *Obj {
	o := &Obj{vals: map[string]any{}}
	for i := 0; i+1 < len(kv); i += 2 {
		o.Set(kv[i].(string), kv[i+1])
	}
	return o
}

func (o *Obj) Set(k string, v any) *Obj {
	if _, seen := o.vals[k]; !seen {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
	return o
}

func (o *Obj) Get(k string) any {
	if o == nil {
		return undefined
	}
	v, ok := o.vals[k]
	if !ok {
		return undefined
	}
	return v
}

func (o *Obj) Has(k string) bool {
	if o == nil {
		return false
	}
	_, ok := o.vals[k]
	return ok
}

func (o *Obj) Delete(k string) {
	if !o.Has(k) {
		return
	}
	delete(o.vals, k)
	for i, key := range o.keys {
		if key == k {
			o.keys = append(o.keys[:i:i], o.keys[i+1:]...)
			break
		}
	}
}

func (o *Obj) Keys() []string { return append([]string(nil), o.keys...) }

// Clone is a shallow copy, as `{ ...o }` is.
func (o *Obj) Clone() *Obj {
	c := &Obj{vals: map[string]any{}}
	for _, k := range o.keys {
		c.Set(k, o.vals[k])
	}
	return c
}

// get reads a key of any value: undefined unless the value is an object holding it, as `value?.key` reads.
func get(v any, k string) any {
	if o, ok := v.(*Obj); ok {
		return o.Get(k)
	}
	return undefined
}

// dig reads nested keys, `v?.a?.b`.
func dig(v any, keys ...string) any {
	for _, k := range keys {
		v = get(v, k)
	}
	return v
}

func isUndefined(v any) bool { _, ok := v.(undefinedType); return ok }

// nullish is `v == null`: undefined or null.
func nullish(v any) bool { return v == nil || isUndefined(v) }

// strOr is the string, or "" when it is not one.
func strOr(v any) string { s, _ := v.(string); return s }

// isTrue is `v === true`.
func isTrue(v any) bool { b, ok := v.(bool); return ok && b }

// isFalse is `v === false`.
func isFalse(v any) bool { b, ok := v.(bool); return ok && !b }

// isInteger is Number.isInteger.
func isInteger(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && !math.IsNaN(f) && f == math.Trunc(f)
}

// strict is `a === b` for the JSON value kinds.
func strict(a, b any) bool {
	switch x := a.(type) {
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case nil:
		return b == nil
	case undefinedType:
		return isUndefined(b)
	case *Obj:
		y, ok := b.(*Obj)
		return ok && x == y
	}
	return false
}

// orNull is `v ?? null`.
func orNull(v any) any {
	if nullish(v) {
		return nil
	}
	return v
}

// parseJSON is JSON.parse: one value, nothing after it but whitespace.
func parseJSON(text string) (any, error) {
	dec := json.NewDecoder(strings.NewReader(text))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("unexpected data after JSON value")
	}
	return v, nil
}

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			o := O()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				k, ok := kt.(string)
				if !ok {
					return nil, errors.New("object key is not a string")
				}
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				o.Set(k, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return o, nil
		case '[':
			arr := []any{}
			for dec.More() {
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return arr, nil
		}
		return nil, errors.New("unexpected delimiter")
	case json.Number:
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil {
			// JSON.parse reads an out-of-range number as Infinity; strconv reports the range and returns it.
			var numErr *strconv.NumError
			if errors.As(err, &numErr) && errors.Is(numErr.Err, strconv.ErrRange) {
				return f, nil
			}
			return nil, err
		}
		return f, nil
	default:
		return t, nil
	}
}

// stringify is JSON.stringify for the value kinds this core holds.
func stringify(v any) string {
	var b bytes.Buffer
	writeJSON(&b, v)
	return b.String()
}

func writeJSON(b *bytes.Buffer, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case undefinedType:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case float64:
		b.WriteString(jsNumber(x))
	case int:
		b.WriteString(strconv.Itoa(x))
	case int64:
		b.WriteString(strconv.FormatInt(x, 10))
	case string:
		writeJSONString(b, x)
	case []string:
		b.WriteByte('[')
		for i, s := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			writeJSONString(b, s)
		}
		b.WriteByte(']')
	case []any:
		b.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			if isUndefined(item) {
				b.WriteString("null")
				continue
			}
			writeJSON(b, item)
		}
		b.WriteByte(']')
	case *Obj:
		b.WriteByte('{')
		first := true
		for _, k := range x.keys {
			val := x.vals[k]
			if isUndefined(val) {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			writeJSONString(b, k)
			b.WriteByte(':')
			writeJSON(b, val)
		}
		b.WriteByte('}')
	default:
		b.WriteString("null")
	}
}

// jsNumber is Number.prototype.toString for a finite number, and JSON's null for the rest.
func jsNumber(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}
	if f == 0 {
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e21 || abs < 1e-6 {
		s := strconv.FormatFloat(f, 'e', -1, 64)
		// Go writes e+21 and e-07; JavaScript writes e+21 and e-7.
		mant, exp, _ := strings.Cut(s, "e")
		sign := exp[0]
		digits := strings.TrimLeft(exp[1:], "0")
		return mant + "e" + string(sign) + digits
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

func writeJSONString(b *bytes.Buffer, s string) {
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20:
			b.WriteString(`\u00`)
			b.WriteByte("0123456789abcdef"[r>>4])
			b.WriteByte("0123456789abcdef"[r&0xf])
		case r == utf8.RuneError && size == 1:
			// A byte that is not UTF-8 has no JavaScript spelling; it was never a character there.
			b.WriteString(`�`)
		default:
			b.WriteString(s[i : i+size])
		}
		i += size
	}
	b.WriteByte('"')
}

// utf16Len is a JavaScript string's length.
func utf16Len(s string) int { return len(utf16.Encode([]rune(s))) }
