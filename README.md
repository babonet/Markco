# Markco - Markdown Comments

Interactive commenting system for Markdown files in VS Code.

[Markco Demo](https://1drv.ms/i/c/d0e12df6da9420b1/IQBBxB5JJK2bSp2OzMklgBkgASCI3vBIyxGyWRzw0x1SyVA?e=UfecfJ)

## Features

- **Inline Comments** - Add comments to any selected text in Markdown files
- **Comment Sidebar** - Dedicated panel showing all comments with navigation
- **Two-Way Navigation** - Click comments to jump to text, or navigate from text to comments
- **Highlight Decorations** - Visual highlighting of commented text
- **Comment Management** - Edit, delete, resolve, and organize comments easily
- **Threaded Replies** - Reply to existing comments to create discussion threads
- **Resolve Comments** - Mark comments as resolved without deleting them

## Usage

1. Open a Markdown file
2. Select some text you want to comment on
3. Press `Ctrl+Shift+M` (or `Cmd+Shift+M` on Mac) or right-click and select "Add Comment"
4. Enter your comment
5. Use the sidebar to view and navigate between comments
6. Click "Reply" on any comment to add a reply to that thread
7. Click the checkmark icon to resolve a comment (resolved comments remain visible but dimmed)
8. Use the eye icon toggle in the sidebar header to show/hide resolved comments

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