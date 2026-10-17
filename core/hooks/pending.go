// What is not ported yet, and says nothing where the Node path may say something.
package hooks

// decisionContext is decision-corpus.mjs's decisionContext over adrCorpus: the governing and killed decisions for a path. It
// is not ported (ADR-110 T1's divergences): the core hands over no decision context. No golden scenario has a record that
// governs the file it edits, so the goldens cannot see this.
func decisionContext(file, root string) string { return "" }
