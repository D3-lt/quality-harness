// Package cart totals a cart in integer cents.
package cart

// Add returns the items with item appended; the input is never changed.
func Add(items []int, item int) []int {
	out := make([]int, 0, len(items)+1)
	out = append(out, items...)
	return append(out, item)
}
