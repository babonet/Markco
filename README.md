# ComMark - Markdown Comments

Interactive commenting system for Markdown files in VS Code.

## Features

- **Inline Comments** - Add comments to any selected text in Markdown files
- **Comment Sidebar** - Dedicated panel showing all comments with navigation
- **Two-Way Navigation** - Click comments to jump to text, or navigate from text to comments
- **Highlight Decorations** - Visual highlighting of commented text
- **Comment Management** - Edit, delete, and organize comments easily

## Usage

1. Open a Markdown file
2. Select some text you want to comment on
3. Press `Ctrl+Shift+M` (or `Cmd+Shift+M` on Mac) or right-click and select "Add Comment"
4. Enter your comment
5. Use the sidebar to view and navigate between comments

## Comment Storage

Comments are stored directly in the Markdown file as a JSON block in an HTML comment at the end of the file:

```markdown
<!-- commark-comments
{
  "version": 1,
  "comments": [
    {
      "id": "5c903516-cf11-444e-9581-567a37228917",
      "anchor": {
        "text": "Interactive commenting system for Markdown files in VS Code.",
        "line": 2,
        "startChar": 0,
        "endChar": 60
      },
      "content": "Nice Header",
      "author": "user",
      "createdAt": "2026-01-15T11:47:50.061Z"
    }
  ]
}
-->
```

This keeps comments portable and version-control friendly.

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch
```

## License

MIT
