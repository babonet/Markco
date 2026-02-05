## Plan: Git Sync for Live Comment Collaboration

**TL;DR**: Enable real-time comment sharing by auto-saving the document after each comment edit and performing Git sync (pull → commit → push) on save. The feature will be opt-in via settings, commit only the affected markdown file, and handle merge conflicts gracefully using the existing `reconcileAnchors()` pattern.

**Steps**

1. **Add new configuration settings** in [package.json](package.json#L93-L103)
   - `markco.gitSync.enabled` (boolean, default: `false`) - Enable Git sync for comments
   - `markco.gitSync.autoPush` (boolean, default: `true`) - Auto-push after commit
   - `markco.gitSync.autoPull` (boolean, default: `true`) - Auto-pull before commit
   - `markco.gitSync.commitMessage` (string, default: `"Markco: {action} comment"`) - Commit message template

2. **Create new `GitSyncService`** at `src/services/GitSyncService.ts`
   - Initialize VS Code Git API via `vscode.extensions.getExtension('vscode.git')`
   - `isEnabled()` - Check if Git sync is enabled and repo is available
   - `pull(filePath)` - Pull latest changes for the file
   - `stageFile(filePath)` - Stage only the specific markdown file
   - `commit(message)` - Commit staged changes
   - `push()` - Push to remote
   - `syncFile(filePath, action)` - Orchestrate: pull → stage → commit → push
   - Error handling with user notifications for common failures (no remote, auth issues, conflicts)

3. **Add auto-save after comment operations** in [CommentService.ts](src/services/CommentService.ts)
   - Modify `saveComments()` to call `document.save()` after successful edit when Git sync is enabled
   - Add small debounce (300ms) to batch rapid changes before saving

4. **Hook Git sync into document save** in [extension.ts](src/extension.ts#L236-L248)
   - Modify `onDidSaveTextDocument` handler
   - After `reconcileAnchors()` completes, call `gitSyncService.syncFile()` 
   - Pass action type from last operation for commit message (e.g., "added comment", "deleted reply")

5. **Track last action for commit messages** in [extension.ts](src/extension.ts)
   - Add state variable `lastCommentAction: { action: string, file: string } | null`
   - Set in each callback before `saveComments()` is called
   - Clear after Git sync completes

6. **Handle merge conflicts** in `GitSyncService`
   - If pull results in conflict in the markco-comments block, show user message
   - Offer to abort (keep local) or accept (keep remote)
   - After conflict resolution, re-run `reconcileAnchors()` to update orphaned comments

7. **Add extension dependency** in [package.json](package.json)
   - Add `"extensionDependencies": ["vscode.git"]` to ensure Git API is available

8. **Add status feedback to sidebar** (optional enhancement)
   - Add new message type `gitSyncStatus` to [types.ts](src/types.ts) `SidebarMessage` union
   - Show sync status indicator in sidebar (syncing, synced, error)
   - Update [CommentSidebarProvider.ts](src/providers/CommentSidebarProvider.ts) to display status

9. **Update documentation**
   - Add Git Sync section to [README.md](README.md) explaining the feature
   - Document settings and requirements (Git must be configured)
   - Update [spec/Markco.md](spec/Markco.md) with new architecture component

**Verification**

1. Unit tests for `GitSyncService`:
   - Mock VS Code Git API
   - Test sync flow with simulated pull/commit/push
   - Test conflict detection and handling

2. Integration test scenario:
   - Enable `markco.gitSync.enabled` in test workspace
   - Add a comment → verify file saves and Git operations fire
   - Simulate remote change → verify pull happens and changes merge

3. Manual testing:
   - Clone repo in two VS Code windows
   - Add comments in window A → verify they appear in window B after pull
   - Test error states: no remote, offline, auth failure

**Decisions**

- **Auto-save on edit**: Chose to save document after each comment operation (with debounce) rather than requiring user to save manually - this aligns with the "live" collaboration goal
- **Single file staging**: Only the affected markdown file is staged/committed, not the entire working tree - keeps comment changes isolated
- **Pull-first strategy**: Always pull before committing to minimize conflicts - if conflict occurs, offer user choice rather than auto-resolving
- **Opt-in by default**: Feature disabled until user explicitly enables it - avoids unexpected Git operations for users who don't want this
