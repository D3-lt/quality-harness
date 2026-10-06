package cart

import "testing"

func TestAdd(t *testing.T) {
	t.Run("appends without changing the input", func(t *testing.T) {
		in := []int{100}
		out := Add(in, 250)
		if len(in) != 1 || len(out) != 2 || out[1] != 250 {
			t.Fatalf("Add(%v, 250) = %v", in, out)
		}
	})
}
