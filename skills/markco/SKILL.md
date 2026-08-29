---
name: markco
description: Manage markco comments in Markdown files — add, reply, resolve, unresolve, remove, edit, and list comments stored in the markco-comments JSON block. Use when the user wants to comment on markdown content, review comments, resolve threads, or manage inline discussions in .md files. Also use when the user mentions "markco", "markdown comments", or asks to annotate/comment on a markdown file.
allowed-tools: Read, Edit, Bash
---

# Markco Comment Management

Manages comments embedded in Markdown files using the [markco](https://marketplace.visualstudio.com/items?itemName=markco.markco) VS Code extension format. Comments are stored as a JSON block inside an HTML comment at the end of the file, invisible when rendered.

## Comment Storage Format

Comments live in a `<!-- markco-comments ... -->` block at the very end of the file:

```
<!-- markco-comments
{
  "version": 2,
  "comments": [ ... ]
}
-->
```

Each comment object:

```json
{
  "id": "uuid-v4",
  "anchor": {
    "text": "exact text snippet from the file",
    "startLine": 10,
    "startChar": 5,
    "endLine": 10,
    "endChar": 28
  },
  "content": "The comment text",
  "author": "Display Name",
  "createdAt": "ISO-8601 timestamp",
  "resolved": false,
  "orphaned": false,
  "thumbsUp": ["alice", "bob"],
  "replies": [
    {
      "id": "uuid-v4",
      "content": "Reply text",
      "author": "Display Name",
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp (only if edited)",
      "thumbsUp": ["alice"]
    }
  ],
  "updatedAt": "ISO-8601 timestamp (only if edited or resolved/unresolve state changed)"
}
```

### Field Rules

- `id`: UUIDv4, generated via `uuidgen` or equivalent
- `anchor.text`: must exactly match the text at the specified line/char positions in the markdown file
- `anchor.startLine` / `endLine`: **0-based** line numbers in the markdown content (matching the VS Code extension convention)
- `anchor.startChar` / `endChar`: **0-based** character offsets within the line
- `resolved`: boolean, defaults to `false`
- `orphaned`: boolean, set to `true` if anchor text can no longer be found at the specified position (optional field — omit if false)
- `thumbsUp`: array of author names, optional — omit if empty
- `replies`: array of reply objects, optional — omit if empty
- `updatedAt`: only present if the comment has been edited or its resolved state changed after creation
- `createdAt`: ISO-8601 UTC timestamp

## Script Reference

The skill includes a Node.js CLI script that handles deterministic operations — anchor position calculation, code-context detection, JSON sanitization, and block parsing/writing. The agent uses this script instead of manually computing positions or parsing JSON.

### Subcommands

**Parse** — extract and deserialise comments from a file:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs parse <file>
```
Outputs `{"version": 2, "comments": [...]}` to stdout. Returns empty comments array if no block exists.

**Serialize** — write comments back to a file (reads JSON from stdin):
```bash
echo '<json>' | node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs serialize <file>
```
Replaces or appends the markco block. Handles `-->` sanitization automatically. If comments array is empty, removes the block entirely.

**Find Anchor** — search for text and return exact positions:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs find-anchor <file> --text "search text" [--occurrence N]
```
Returns all occurrences with 0-based line/char positions. Excludes code fences, inline code, and the markco block itself. `--occurrence N` (1-based) filters to a single result.

**Reconcile** — update all anchor positions in-place:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs reconcile <file>
```
Re-finds each anchor's text, updates positions if moved, marks as orphaned if not found. Only writes if changes detected. Outputs `{updated: [...], orphaned: [...], unchanged: [...]}`.

## Author Resolution

Use the git user name as the default author:

```bash
git config user.name
```

If the user specifies a different author, use that instead.

## Operations

### 1. List Comments

```bash
node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs parse <file>
```

Present the parsed comments in a readable format:
- Status indicator: `[resolved]` or `[open]` (and `[orphaned]` if applicable)
- The anchored text snippet and its location (line numbers)
- The comment content and author
- Any replies, indented

Group by resolved status: open comments first, then resolved.

### 2. Add Comment

Required input: file path, the text to anchor to, and the comment content.

Steps:
1. Find anchor positions: `node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs find-anchor <file> --text "anchor text"`
2. If multiple occurrences returned, ask the user which one (or use `--occurrence N`)
3. Generate a UUID: `uuidgen | tr '[:upper:]' '[:lower:]'`
4. Get the timestamp: `date -u +"%Y-%m-%dT%H:%M:%S.000Z"`
5. Get the author: `git config user.name`
6. Parse existing comments: `node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs parse <file>`
7. Construct the new comment object using the anchor from step 1, append to the comments array
8. Pipe the updated data to serialize: `echo '<json>' | node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs serialize <file>`

### 3. Reply to Comment

Required input: file path, comment identifier (ID, anchor text snippet, or comment content substring), and reply content.

Steps:
1. Parse comments: `node ${CLAUDE_SKILL_DIR}/scripts/markco.mjs parse <file>`
2. Find the target comment — match by ID, anchor text, or content substring
3. If ambiguous, show candidates and ask the user to clarify
4. Generate UUID and timestamp, get author name
5. Append the reply to the comment's `replies` array
6. Serialize the updated data back to the file

### 4. Edit Comment or Reply

Required input: file path, comment/reply identifier, and new content.

Steps:
1. Parse comments, find the target comment or reply
2. Update the `content` field
3. Set `updatedAt` to the current timestamp
4. Serialize back to the file

### 5. Resolve / Unresolve Comment

Required input: file path, comment identifier.

Steps:
1. Parse comments, find the target comment
2. Toggle or set `resolved` to the target state
3. Set `updatedAt` to the current timestamp
4. Serialize back to the file

### 6. Remove Comment

Required input: file path, comment identifier.

Steps:
1. Parse comments, find the target comment
2. Remove it from the comments array
3. Serialize back (the script automatically removes the block if no comments remain)

### 7. React (Thumbs Up)

Required input: file path, comment/reply identifier, author name (defaults to git user).

Steps:
1. Parse comments, find the target comment or reply
2. Toggle the author in the `thumbsUp` array (add if absent, remove if present)
3. If the array becomes empty, remove the `thumbsUp` field
4. Serialize back to the file

## Implementation Notes

- **Always use the script** for parsing and writing the markco block — never hand-edit the JSON inline. The script handles `-->` sanitization (replacing with zero-width space to prevent breaking the HTML comment), code-context detection (skipping `<!-- markco-comments` inside code fences or inline code), and CRLF/LF normalisation.
- **UUID generation**: `uuidgen | tr '[:upper:]' '[:lower:]'`
- **Timestamp generation**: `date -u +"%Y-%m-%dT%H:%M:%S.000Z"`
- **After bulk file edits** that might shift line numbers, run `reconcile` to update anchor positions and detect orphaned comments.

## Argument Parsing

The user may invoke this skill in several ways:

- `/markco list <file>` — list all comments
- `/markco add <file>` — then the agent asks what text to anchor to and what the comment should say
- `/markco reply <file>` — then the agent identifies the comment and asks for reply content
- `/markco resolve <file>` — resolve a comment
- `/markco unresolve <file>` — unresolve a comment
- `/markco remove <file>` — remove a comment
- `/markco edit <file>` — edit a comment's content
- `/markco react <file>` — toggle thumbs up on a comment or reply

If no subcommand is given, infer intent from context. If a file path is given without a subcommand, default to `list`.

If no file path is given, check if the conversation context makes the target file obvious. If not, ask.
