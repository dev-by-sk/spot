# spot

sample text

Guide to writing test use this prompt format: "Do not write tests that are guaranteed to pass given the current implementation. Write tests for correct behavior. If you find a scenario the implementation likely handles wrong, write the test and add a comment flagging it."

After each session:
Run npx jest --coverage
and paste the output back to Claude Code:
Here's the coverage report after the last test session. What critical
branches are still untested? Write tests for the gaps.
