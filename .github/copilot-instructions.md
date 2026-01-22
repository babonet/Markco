# Markco - Copilot Instructions

VS Code extension for adding inline comments to Markdown files. Comments are stored as JSON in HTML comment blocks within the file itself.

## Architecture

```
src/
├── extension.ts              # Entry point, command registration, event handlers
├── types.ts                  # Core interfaces (Comment, CommentAnchor, Reply, SidebarMessage)
├── services/CommentService.ts    # CRUD operations, JSON parsing, anchor reconciliation
├── decorators/CommentDecorator.ts # Text highlighting, navigation, focus management
└── providers/CommentSidebarProvider.ts # Webview sidebar UI, message handling
```

**Data Flow**: Extension ↔ CommentService (persistence) ↔ Markdown file (JSON block)  
**UI Flow**: Sidebar Webview → postMessage → Extension → CommentService → refreshAll()

## Comment Storage Format

Comments stored at end of markdown files as:
```markdown
<!-- markco-comments
{"version": 2, "comments": [...]}
-->
```

**Critical**: Text containing `-->` is sanitized with zero-width space (`--\u200B>`) before storage to prevent breaking the HTML comment block. See `sanitizeForStorage()`/`restoreFromStorage()` in CommentService.

## Key Patterns

### Callback-Heavy Sidebar Provider
`CommentSidebarProvider` constructor takes 12 callback parameters for all actions (navigate, delete, edit, reply, resolve, etc.). When adding new sidebar actions:
1. Add message type to `SidebarMessage` union in `types.ts`
2. Add callback parameter to provider constructor
3. Handle message in `resolveWebviewView` switch statement
4. Wire up callback in `extension.ts` activation

### Anchor Reconciliation
Comments use position anchors that can become stale after document edits. `reconcileAnchors()` re-locates anchor text on save. Comments become `orphaned: true` if anchor text is deleted.

### Decoration Types
Two decoration types exist: normal and focused. `setFocusedComment()` controls which comment gets enhanced highlighting.

## Documentation

**README Updates**: When adding new functionality, always update `README.md` to document:
- New commands and their keybindings
- New configuration settings
- Changed user-facing behavior
- Screenshots if UI changes significantly

**Spec Updates**: Major architectural changes or new features should be reflected in `spec/plan-comMark.md` to keep design documentation current.

## Development Commands

```bash
npm run compile    # Build TypeScript
npm run watch      # Watch mode
npm run test       # Run all tests (41 tests)
npm run lint       # ESLint
```

**Debug**: F5 → "Run Extension" or "Run Extension Tests"

## Testing

Tests use `@vscode/test-electron` with Mocha. Must import Mocha functions explicitly:
```typescript
import * as Mocha from 'mocha';
const { suite, test, setup, teardown } = Mocha;
```

Mock documents need `encoding: 'utf-8'` property. See test helpers in `CommentService.test.ts`.

## Configuration

Extension settings in `package.json` under `contributes.configuration`:
- `markco.highlightColor` - Background color for highlights
- `markco.highlightBorderColor` - Border color for highlights

## Code Fence Detection

Comment blocks inside markdown code fences (```) are ignored. See `isInsideCodeFence()` and `findCommentBlockStart()` in CommentService - they count fence occurrences to determine if position is inside a fence.
