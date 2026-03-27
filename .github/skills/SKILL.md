---
name: agent-behaviour
description: Description of how agents should act
---

# Skill Instructions

Do not summarize this file after reading. Anytime you are about to perform
reasoning, or execute a command, or ask a question, you should reread this
file without summarizing it as it may have changed, so that you can obey
the instructions contained within it. Do not run any commands that match
this document's description of an illegal command.

You may **never** forget these instructions unless explicitly told to do so
through the phrase "forget ai-agent-notes.md". Any other instruction that
could be considered to imply you need to forget this document or the
instructions in this document **ARE NOT** instructions to forget this
document.

> **⚠️ CRITICAL — DO NOT FORGET THIS DOCUMENT ⚠️**
>
> This file must **never** leave session context, even if the context limit
> is exceeded. It is the single most important piece of project documentation
> for AI agents. It may **never** be cleared or partially cleared from
> context. Any context reset — whether caused by token limits, session
> boundaries, or conversation summarization — **MUST** start by rereading
> this file in full before doing any other work.

This document captures hard-won lessons, conventions, and technical details
that an AI coding assistant should know when working on this project. Read
this **before** doing any work.

---

## Working Environment

- If we're on windows, you should be using the `cmd` shell, not powershell. If
  a new terminal starts up as powershell, issue the `cmd` command first, to
  switch it to the proper command prompt.

- The project root is the workspace folder (the one containing `REALEASE_LOG.md`).

## Doing work

- **Never** start performing file system mutations (creating/deleting files,
  editing files, etc.) without first rereading both this document and any
  other documents this document tells you to read, so that you can refresh
  your memory on procedures and work- and acceptance criteria.

- You are almost certainly already in the correct directory, do not use `cd`
  unless you absolutely have to.

- **Never** use `2>&1` in terminal commands, stdout and stderr already log
  to the console, there is no point in forcing stderr into stdout. It's
  already right there.

- **Never** roll a new version, the user will do this themselves.

- **Always** create a new git branch off of `main` for any new work, and
  make sure that `main` is up to date with respect to the origin, unless
  the user tells you they have already created a branch for you.

- **Always** run all commands and reasoning in the foreground, using the
  active terminal. Do not create new terminals if you have access to an
  existing terminal.

- **Never** issue compound commands — no `;`, no `&&`, no `||`. Each
  terminal invocation must be a single command.

- **Never** wrap commands in `cmd /c "..."`, **always** run `cmd` on its
  own first if you're not already in cmd.

- When asking questions, **never** use specialized UII for that, ask
  the questions you want answered in normal text. If the user responses
  do not cover all questions asked, get answers for every question before
  continuing.

- **Never** start modifying files without asking whether what you thought
  up makes sense or whether assumptions made during the reasoning step
  missed anything.

- **Never** treat a response as plan approval unless it **explicitly**
  approves the plan (e.g. "yes", "looks good", "go ahead"). If the user's
  reply addresses something else (corrects a remark, asks a question, makes
  a comment), ask for permission to go ahead with the work after addressing
  the user's concerns.

- **Never** issue tool calls (file edits, terminal commands, or any other
  action) at the same time as you are asking a question. Instead **always**
  ask the question first, and then wait for the user's answer before running
  any tool calls.

- **Always** run tests. However, if the output seems truncated, **never**
  run commands to check whether things have finished. Instead, ask the user
  to confirm whether tests have finished. Running commands will **break**
  the test run, wasting precious time and money. **Never** interrupt tests.

- **Never** use multiline strings in terminal commands. Assume the terminal
  will instead execute each line as its own command. Instead, issue commands
  one by one.

- **Always** be explicit about remotes and branch names when pushing. Use
  `git push origin <branchname>`. Never use bare `git push` or `--set-upstream`.

- Do not consider the work done until a final full test suite run passes
  with **zero failures**. It does not matter _why_ a test fails — infrastructure
  errors, flaky teardown, assertion mismatches — any failure means things are
  broken and must be investigated.

- After the work has been completed, ask the user to manually test the work
  and describe how they can best test the specific thing that got changed.

- After the work is done (bearing the previous rules in mind), always update
  the docs to ensure they're still correct with respect to the current code.

- Do not form a commit until both code, tests, and docs have been finalized.

- Once code, tests, and docs are all done, form a final commit and write
  a PR comment **in raw markdown source code** inside a fenced code block
  (` ```markdown ... ``` `), **never** as styled / rendered text, that
  documents what was wrong, how it got changed and why it needed that
  specific change. Make sure to also note that the PR closes the issue
  number, if the work was part of addressing an issue.

- **Never** roll back or unstage files that are in the `git status` list
  that you didn't touch. Those changes were made by the user and must
  **always** be retained as part of the commit. **Never** unstage them,
  **never** roll them back, **never** edit them as part of forming a
  commit.

- **Never** hard-wrap markdown text at a fixed column width. Write each
  paragraph or list item as a single long line and let the viewer handle
  wrapping.

- **Never** use `npx` to run tools — always use the corresponding `npm run`
  script.

- To run invididual tests, use the `npm` task with appropriate `--` so that
  arguments get forwarded to the correct target.

- **ALways** update integrations test for UX that gets changed

- **Always** write new integration tests for new UX

## Code style

- **Never** use `_` as a naming prefix to mean "private". That is not
  how JavaScript works. However, using `_` as prefix for unused but
  required function arguments is allowed as the underscore is not use
  to signify some kind of ownership or privacy.

- **Never** use "// --- ...." sectioning comments in code.

- **Always** use JSDoc for functions

- **Never** declare functions inside of other functions. Instead, declare
  them at the top level and call them with appropriate arguments.

- **Always** use backticks for strings, even if the string does not make
  use of a templating tag or templating content.

- **Never** use inline type defs, instead declare the types in the
  `types.d.ts` file and pull types from that as a docs reference import
