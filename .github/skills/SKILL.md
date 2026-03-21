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

- **OS**: Windows. Default shell is `cmd.exe`.
- **Shell rule**: If you are not already in the standard command prompt, run
  `cmd` first. Then check whether you are already in the project directory —
  `cd` is almost never necessary because the terminal usually opens in the
  workspace root already. **Do not blindly prepend `cd …` to commands.**
- **Never** use `2>&1` in terminal commands.
- The project root is the workspace folder (the one containing `package.json`).
- **Never** modify `package.json` version manually. Versioning is done with
  `npm version` — that command handles `package.json`, `package-lock.json`,
  the git tag, and the commit all in one step.

## Doing work

- **Always** create a new git branch off of `main` for any new work, and
  make sure that `main` is up to date with respect to the origin.
- **Always** run all commands and reasoning in the foreground
- **ALways** use the active terminal to run any commands
- **Never** use `_` as a naming prefix to mean "private". That is not
  how JavaScript works. However, using `_` as prefix for unused but
  required function arguments is allowed as the underscore is not use
  to signify some kind of ownership or privacy.
- **Never** use "// --- ...." sectioning comments in code.
- **Never** issue compound commands — no `;`, no `&&`, no `||`. Each
  terminal invocation must be a single command.
- **Never** wrap commands in `cmd /c "..."`, **always** run `cmd` on its
  own first if you're not already in cmd.
- When asked to offer multiple choices, **never** present option picking
  UI, instead ask what option to select and wait for the user to type
  the answer.
- **Never** start modifying files without asking whether what you thought
  up makes sense or whether assumptions made during the reasoning step
  missed anything.
- **Never** issue tool calls (file edits, terminal commands, or any other
  action) in the same response as a question. Ask the question, stop, and
  wait for the user's answer before taking any action. A question followed
  by an immediate tool call is not asking — it is ignoring the user.
- **After starting a test run**, do **nothing** — no terminal commands, no
  file reads, no edits — until the **user explicitly says the tests have
  finished** and provides results. Terminal output may be truncated or
  returned before the command completes; never assume tests are done based
  on partial output alone.
- **Never** use multiline strings in terminal commands. `cmd.exe` treats
  each line as a separate command. Git commit messages must be a single
  line: `git commit -m "one line summary"`.
- **Always** be explicit about remote and branch when pushing:
  `git push origin <branchname>`. Never use bare `git push` or
  `--set-upstream`.
- Do not consider the work done until a final full test suite run passes
  with **zero failures**. It does not matter *why* a test fails — infrastructure
  errors, flaky teardown, assertion mismatches — any failure means things are
  broken and must be investigated. You run the test suite, but you wait for
  the user to tell you the result.
- After the work has been completed **ask the user to manually test the work**.
- After testing finishes, update the docs to ensure they're still correct
  with respect to the current code.
- Once code, tests, and docs are all done, form a final commit and write
  a PR comment **in raw markdown source code** inside a fenced code block
  (` ```markdown ... ``` `), **never** as styled / rendered text, that
  documents what was wrong, how it got changed and why it needed that
  specific change. Make sure to also note that the PR closes the issue
  number, if the work was part of addressing an issue.
- **Never** hard-wrap markdown text at a fixed column width. Write each
  paragraph or list item as a single long line and let the viewer handle
  wrapping.
- Note that any changes to this file should **always** be added to git
  commits. They should never be backed out or unstaged.
- **Do not** use vitest — the project does not use it.
- **Never** use `npx` to run tools — always use the corresponding `npm run`
  script. To run a single spec file: `npm run test:integration -- path/to/file.spec.js`.
- **ALways** update integrations test for UX that gets changed
- **Always** write new integration tests for new UX
- **Never** interrupt the full suite or integration tests if they seem to
  be running long, instead ask the user to tell you when they finish.
- **Never** believe the output if it looks truncated, and instead assume
  the tests are still running, and ask the user to tell you when they finish.

# AI Agent notes

Always read the `ai-agent-notes.md` document for further information.
