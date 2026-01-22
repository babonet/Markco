# Markco - Markdown Comments

Interactive commenting system for Markdown files in VS Code.

## Screenshots

### Comment Sidebar

![Comment Sidebar](media/screenshot1.png)

### Preview Highlighting

![Preview Highlighting](media/preview-screenshot.png)

## Features

- **Inline Comments** - Add comments to any selected text in Markdown files
- **Smart Selection** - Auto-selects word at cursor or entire line if no text selected
- **Comment Sidebar** - Dedicated panel showing all comments with navigation
- **Inline Editing** - Edit comments and replies directly in the sidebar without pop-up dialogs
- **Two-Way Navigation** - Click comments to jump to text, or navigate from text to comments
- **Highlight Decorations** - Visual highlighting of commented text in the editor
- **Preview Highlighting** - Commented text is also highlighted in Markdown preview with tooltips showing comment content
- **Comment Management** - Edit, delete, resolve, and organize comments easily
- **Threaded Replies** - Reply to existing comments to create discussion threads
- **Resolve Comments** - Mark comments as resolved without deleting them
- **Orphan Recovery** - Re-anchor comments when their original text is deleted
- **Git Integration** - Author names automatically populated from Git config

## Usage

1. Open a Markdown file
2. Select text to comment on, or just place your cursor (the extension will auto-select the word at cursor, or the entire line if cursor is at line start/end)
3. Press `Ctrl+Shift+M` (or `Cmd+Shift+M` on Mac) or click the **+** button in the sidebar
4. Type your comment in the sidebar form and click "Add Comment"
5. Use the sidebar to view and navigate between comments
6. Click the reply icon on any comment to add a reply
7. Click the edit icon to modify a comment or reply inline (only your own comments/replies)
8. Click the checkmark icon to resolve a comment (resolved comments remain visible but dimmed)
9. Use the eye icon toggle in the sidebar header to show/hide resolved comments
10. If anchor text is deleted, use the pin icon on orphaned comments to re-anchor to new selected text

## Keyboard Shortcuts

| Shortcut | Action |
| -------- | ------ |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Add comment (works with or without selection - auto-selects word or line) |
| `Ctrl+Enter` / `Cmd+Enter` | Submit comment/reply (when editing in sidebar) |
| `Escape` | Cancel editing (when in sidebar form) |

## Comment Storage

Comments are stored directly in the Markdown file as a JSON block in an HTML comment at the end of the file:

```markdown
<!-- markco-comments
{
  "version": 2,
  "comments": [
    {
      "id": "5c903516-cf11-444e-9581-567a37228917",
      "anchor": {
        "text": "Interactive commenting system for Markdown files in VS Code.",
        "startLine": 2,
        "startChar": 0,
        "endLine": 2,
        "endChar": 60
      },
      "content": "Nice Header",
      "author": "user",
      "createdAt": "2026-01-15T11:47:50.061Z",
      "resolved": false,
      "replies": [
        {
          "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "content": "I agree, looks great!",
          "author": "reviewer",
          "createdAt": "2026-01-15T12:00:00.000Z"
        }
      ]
    }
  ]
}
-->
```

This keeps comments portable and version-control friendly.

<!-- markco-comments
{
  "version": 2,
  "comments": []
}
-->