## Plan: Interactive Markdown Commenting Extension (ComMark)

Create a VS Code extension that enables inline commenting in Markdown files with a dedicated comment sidebar for navigation and management. Uses VS Code's native text editor with `TextEditorDecorationType` for highlighting and a `WebviewViewProvider` for the sidebar panel.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Window                           │
├──────────────────────────────────┬──────────────────────────┤
│     Native Text Editor           │   Comment Sidebar        │
│  ┌────────────────────────────┐  │  (WebviewViewProvider)   │
│  │ # My Document              │  │  ┌─────────────────────┐ │
│  │                            │  │  │ Comments (2)    X   │ │
│  │ This is [highlighted text] │◄─┼──│ ┌─────────────────┐ │ │
│  │ with a comment.            │  │  │ │ "Review this"   │ │ │
│  │                            │  │  │ │ On: "highligh.."│ │ │
│  │ <!-- commark-comments      │  │  │ └─────────────────┘ │ │
│  │ { "comments": [...] }      │  │  │ ┌────────────────┐  │ │
│  │ -->                        │  │  │ │ "Check grammar"│  │ │
│  └────────────────────────────┘  │  │ └────────────────┘  │ │
│   TextEditorDecorationType       │  └─────────────────────┘ │
└──────────────────────────────────┴──────────────────────────┘
```

### Steps

1. **Initialize extension project structure** with:
   - [package.json](package.json) - Extension manifest with `views`, `viewsContainers`, commands, activation events
   - [src/extension.ts](src/extension.ts) - Main activation, register providers and commands
   - Commands: `commark.addComment`, `commark.deleteComment`, `commark.toggleSidebar`
   - Activation: `onLanguage:markdown`

2. **Create CommentService** in [src/services/CommentService.ts](src/services/CommentService.ts):
   - `parseComments(document)` - Extract JSON from `<!-- commark-comments ... -->` block
   - `saveComments(document, comments)` - Serialize and write JSON block to end of file
   - `addComment(document, selection, content)` - Create new comment with anchor
   - `deleteComment(document, commentId)` - Remove comment by ID (cascade deletes replies)
   - `updateComment(document, commentId, content)` - Edit comment text
   - `addReply(document, commentId, content)` - Add a reply to an existing comment
   - `deleteReply(document, commentId, replyId)` - Remove a reply from a comment
   - `updateReply(document, commentId, replyId, content)` - Edit reply text
   - `reconcileAnchors(document)` - Re-match anchors after document edits

3. **Create CommentDecorator** in [src/decorators/CommentDecorator.ts](src/decorators/CommentDecorator.ts):
   - `TextEditorDecorationType` for comment highlights (background color, border)
   - `applyDecorations(editor, comments)` - Set decoration ranges from comment anchors
   - `clearDecorations(editor)` - Remove all decorations
   - Listen to `onDidChangeTextDocument` to update decorations in real-time

4. **Create CommentSidebarProvider** in [src/providers/CommentSidebarProvider.ts](src/providers/CommentSidebarProvider.ts):
   - Implements `WebviewViewProvider` for sidebar panel
   - Renders comment list with HTML/CSS (no React needed for MVP)
   - Renders nested replies under each comment
   - Handles messages: `navigateToComment`, `deleteComment`, `editComment`, `requestReply`, `deleteReply`, `requestEditReply`
   - `refresh()` method to update view when comments change

5. **Implement two-way navigation**:
   - Sidebar → Editor: On comment click, use `editor.revealRange()` + flash decoration
   - Editor → Sidebar: On text selection, command `commark.addComment` opens input box
   - Use `vscode.commands.executeCommand` for cross-component communication

6. **Wire up event listeners** in [src/extension.ts](src/extension.ts):
   - `onDidChangeActiveTextEditor` - Refresh decorations and sidebar
   - `onDidChangeTextDocument` - Reconcile anchors, update decorations
   - `onDidSaveTextDocument` - Persist any pending anchor updates

### Comment Storage Format

Comments are stored as a JSON block at the end of the Markdown file, wrapped in an HTML comment to remain invisible when rendered:

```markdown
<!-- commark-comments
{
  "version": 2,
  "comments": [
    {
      "id": "uuid-string",
      "anchor": {
        "text": "highlighted text snippet",
        "startLine": 10,
        "startChar": 5,
        "endLine": 10,
        "endChar": 28
      },
      "content": "The actual comment text",
      "author": "username",
      "createdAt": "2026-01-15T10:30:00Z",
      "replies": [
        {
          "id": "reply-uuid",
          "content": "Reply text here",
          "author": "reviewer",
          "createdAt": "2026-01-15T11:00:00Z"
        }
      ]
    }
  ]
}
-->
```

**Benefits:**
- Main Markdown content stays clean and readable
- Single file - portable, works with Git
- Structured JSON is easy to parse/validate
- Hidden in HTML comment - invisible in rendered output
- Position anchoring via line number + character offsets

**Anchor reconciliation:** When document is edited, anchors are re-matched by searching for the `anchor.text` snippet near the stored line number, updating offsets as needed.

### File Structure

```
commark/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts              # Activation, command registration
│   ├── types.ts                  # Comment, Anchor interfaces
│   ├── services/
│   │   └── CommentService.ts     # Parse, save, CRUD operations
│   ├── decorators/
│   │   └── CommentDecorator.ts   # TextEditorDecorationType management
│   └── providers/
│       └── CommentSidebarProvider.ts  # WebviewViewProvider
└── media/
    ├── sidebar.css               # Sidebar styling
    └── icon.svg                  # Activity bar icon
```
