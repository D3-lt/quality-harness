package hooks

// ADR-120 T13: the Go advisory arm answers the rows of tests/mention-stash.test.mjs as the Node one does. The parity test compares
// them by corpus when it runs; this one holds them under a plain `go test ./hooks/`.

import "testing"

func TestStashPushIsNoMention(t *testing.T) {
	for _, command := range []string{
		"git stash push", "git stash push -m wip", "git -C sub stash push", "git -c x=y stash push -u", "git --no-pager stash push",
		"git stash push && git stash push", "git stash push git stash push", "git stash push git stash push git stash push",
		"echo ok; git stash push -m \"wip\"", "git\tstash push",
	} {
		if mentionsCommitOrPush(command) {
			t.Errorf("%q is a stash and was mentioned as a push", command)
		}
	}
	for _, command := range []string{
		"git push", "git -c x=y push", "git stash push && git push", "git push; git stash push", "git stash push; git commit -m x",
		"echo stash push", "git stash push-x; git stash push && echo push", "ngit stash push", "git stash push git stash push git push",
	} {
		if !mentionsCommitOrPush(command) {
			t.Errorf("%q is a push and was not mentioned", command)
		}
	}
}
