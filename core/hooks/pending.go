// ADR-137 T3: the decision context an edit hands the agent comes from the core's reader (decisioncorpus_read.go), which gives
// the text plugin/scripts/decision-corpus.mjs's decisionContext gives; no node is started. Its gates are the ones the Node
// call had, and a reader failure is said as it was then.
package hooks

import "time"

// decisionReaderBudget is the spawn timeout the Node call had: past it the edit is told the reader could not run.
const decisionReaderBudget = 10 * time.Second

const decisionReaderFailed = "could-not-look: the decision reader could not run, so which decisions govern this edit is unknown."

func (r *decisionRepo) decisionContext(file string) string {
	if outsideRoot(r.root, file) {
		return ""
	}
	if r.readContext == nil {
		listed := r.tracked()
		if hasDecisionCorpus(listed, dcPlatform()) == "false" {
			return ""
		}
		r.readContext = dcDecisionContext(r.root, listed)
	}
	read := r.readContext
	answer := decisionReaderWithin(decisionReaderBudget, func() string { return read(file) })
	if answer == decisionReaderFailed {
		// A timed-out goroutine can still be using its corpus. Give the next path a fresh reader.
		r.readContext = nil
	}
	return answer
}

// decisionReaderWithin is read's answer, or the could-not-look line when it panics or outlasts the budget. A read past the
// budget is abandoned, not stopped: the hook process exits with it.
func decisionReaderWithin(budget time.Duration, read func() string) string {
	answer := make(chan string, 1)
	go func() {
		defer func() {
			if recover() != nil {
				answer <- decisionReaderFailed
			}
		}()
		answer <- read()
	}()
	timer := time.NewTimer(budget)
	defer timer.Stop()
	select {
	case said := <-answer:
		return said
	case <-timer.C:
		return decisionReaderFailed
	}
}
