import * as vscode from 'vscode';
import { Comment, SidebarMessage } from '../types';

/**
 * Provides the webview sidebar for displaying and managing comments
 */
export class CommentSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'markco.commentSidebar';
  private _view?: vscode.WebviewView;
  private _comments: Comment[] = [];
  private _focusedCommentId: string | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onNavigate: (commentId: string) => void,
    private readonly _onDelete: (commentId: string) => void,
    private readonly _onEdit: (commentId: string, content: string) => void,
    private readonly _onReady?: () => void,
    private readonly _onRequestEdit?: (commentId: string) => void,
    private readonly _onRequestReply?: (commentId: string) => void,
    private readonly _onDeleteReply?: (commentId: string, replyId: string) => void,
    private readonly _onRequestEditReply?: (commentId: string, replyId: string) => void,
    private readonly _onResolve?: (commentId: string) => void
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      switch (message.type) {
        case 'navigateToComment':
          this._onNavigate(message.commentId);
          break;
        case 'deleteComment':
          this._onDelete(message.commentId);
          break;
        case 'editComment':
          this._onEdit(message.commentId, message.content);
          break;
        case 'requestEdit':
          if (this._onRequestEdit) {
            this._onRequestEdit(message.commentId);
          }
          break;
        case 'requestReply':
          if (this._onRequestReply) {
            this._onRequestReply(message.commentId);
          }
          break;
        case 'deleteReply':
          if (this._onDeleteReply) {
            this._onDeleteReply(message.commentId, message.replyId);
          }
          break;
        case 'requestEditReply':
          if (this._onRequestEditReply) {
            this._onRequestEditReply(message.commentId, message.replyId);
          }
          break;
        case 'resolveComment':
          if (this._onResolve) {
            this._onResolve(message.commentId);
          }
          break;
        case 'ready':
          // Webview is ready, request current comments from extension
          if (this._onReady) {
            this._onReady();
          }
          break;
      }
    });

    // Refresh view when it becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh(this._comments);
      }
    });
  }

  /**
   * Refresh the sidebar with updated comments
   */
  public refresh(comments: Comment[]): void {
    this._comments = comments;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'refresh',
        comments: comments
      } as SidebarMessage);
    }
  }

  /**
   * Focus a specific comment in the sidebar
   */
  public focusComment(commentId: string): void {
    this._focusedCommentId = commentId;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'focusComment',
        commentId: commentId
      } as SidebarMessage);
    }
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css')
    );

    // Use VS Code's built-in codicons via the webview toolkit
    const codiconsUri = 'https://microsoft.github.io/vscode-codicons/dist/codicon.css';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} https://microsoft.github.io 'unsafe-inline'; font-src ${webview.cspSource} https://microsoft.github.io; script-src 'unsafe-inline';">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${codiconsUri}" rel="stylesheet">
  <title>Comments</title>
</head>
<body>
  <div id="app">
    <div class="header">
      <h3>Comments <span id="comment-count">(0)</span></h3>
      <button id="toggle-resolved" class="btn-toggle" title="Toggle resolved comments">
        <i class="codicon codicon-eye"></i>
      </button>
    </div>
    <div id="comments-list" class="comments-list">
      <div class="no-comments">
        <p>No comments yet.</p>
        <p class="help-text">Select text and press <kbd>Ctrl+Shift+M</kbd> to add a comment.</p>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let comments = [];
    let editingId = null;
    let showResolved = true;

    function toggleResolved() {
      showResolved = !showResolved;
      const toggleBtn = document.getElementById('toggle-resolved');
      const icon = toggleBtn.querySelector('i');
      if (showResolved) {
        icon.className = 'codicon codicon-eye';
        toggleBtn.title = 'Hide resolved comments';
        toggleBtn.classList.remove('hidden-resolved');
      } else {
        icon.className = 'codicon codicon-eye-closed';
        toggleBtn.title = 'Show resolved comments';
        toggleBtn.classList.add('hidden-resolved');
      }
      renderComments();
    }

    function renderComments() {
      const container = document.getElementById('comments-list');
      const countEl = document.getElementById('comment-count');
      const filteredComments = showResolved ? comments : comments.filter(c => !c.resolved);
      const resolvedCount = comments.filter(c => c.resolved).length;
      countEl.textContent = '(' + filteredComments.length + (resolvedCount > 0 && !showResolved ? ' / ' + comments.length : '') + ')';

      if (filteredComments.length === 0) {
        container.innerHTML = \`
          <div class="no-comments">
            <p>\${comments.length === 0 ? 'No comments yet.' : 'No unresolved comments.'}</p>
            <p class="help-text">\${comments.length === 0 ? 'Select text and press <kbd>Ctrl+Shift+M</kbd> to add a comment.' : 'Click the eye icon to show resolved comments.'}</p>
          </div>
        \`;
        return;
      }

      container.innerHTML = filteredComments.map(comment => \`
        <div class="comment-item \${comment.resolved ? 'resolved' : ''}" data-id="\${comment.id}" onclick="navigateToComment('\${comment.id}')">
          <div class="comment-header">
            <span class="comment-author">\${escapeHtml(comment.author)}</span>
            <span class="comment-date">\${formatDate(comment.createdAt)}</span>
          </div>
          <div class="comment-content">\${escapeHtml(comment.content)}</div>
          <div class="comment-anchor">On: "\${escapeHtml(truncate(comment.anchor.text, 40))}"</div>
          <div class="comment-actions">
            <div class="actions-left">
              <button class="btn-icon btn-reply" onclick="event.stopPropagation(); startReply('\${comment.id}')" title="Reply"><i class="codicon codicon-comment"></i></button>
              <button class="btn-icon btn-edit" onclick="event.stopPropagation(); startEdit('\${comment.id}')" title="Edit"><i class="codicon codicon-edit"></i></button>
            </div>
            <div class="actions-right">
              <button class="btn-icon btn-resolve \${comment.resolved ? 'resolved' : ''}" onclick="event.stopPropagation(); resolveComment('\${comment.id}')" title="\${comment.resolved ? 'Reopen' : 'Resolve'}"><i class="codicon codicon-\${comment.resolved ? 'issue-reopened' : 'check'}"></i></button>
              <button class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteComment('\${comment.id}')" title="Delete"><i class="codicon codicon-trash"></i></button>
            </div>
          </div>
          \${renderReplies(comment)}
        </div>
      \`).join('');
    }

    function navigateToComment(id) {
      vscode.postMessage({ type: 'navigateToComment', commentId: id });
    }

    function deleteComment(id) {
      vscode.postMessage({ type: 'deleteComment', commentId: id });
    }

    function resolveComment(id) {
      vscode.postMessage({ type: 'resolveComment', commentId: id });
    }

    function startEdit(id) {
      // Send request to extension to show input box (prompt doesn't work in webviews)
      vscode.postMessage({ type: 'requestEdit', commentId: id });
    }

    function startReply(commentId) {
      // Send request to extension to show input box for reply
      vscode.postMessage({ type: 'requestReply', commentId: commentId });
    }

    function deleteReply(commentId, replyId) {
      vscode.postMessage({ type: 'deleteReply', commentId: commentId, replyId: replyId });
    }

    function startEditReply(commentId, replyId) {
      vscode.postMessage({ type: 'requestEditReply', commentId: commentId, replyId: replyId });
    }

    function renderReplies(comment) {
      if (!comment.replies || comment.replies.length === 0) {
        return '';
      }
      return \`
        <div class="replies-container" onclick="event.stopPropagation()">
          \${comment.replies.map(reply => \`
            <div class="reply-item" data-reply-id="\${reply.id}">
              <div class="reply-header">
                <span class="reply-author">\${escapeHtml(reply.author)}</span>
                <span class="reply-date">\${formatDate(reply.createdAt)}</span>
              </div>
              <div class="reply-content">\${escapeHtml(reply.content)}</div>
              <div class="reply-actions">
                <button class="btn-icon btn-edit-reply" onclick="startEditReply('\${comment.id}', '\${reply.id}')" title="Edit"><i class="codicon codicon-edit"></i></button>
                <button class="btn-icon btn-delete-reply" onclick="deleteReply('\${comment.id}', '\${reply.id}')" title="Delete"><i class="codicon codicon-trash"></i></button>
              </div>
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function focusComment(id) {
      document.querySelectorAll('.comment-item').forEach(el => {
        el.classList.remove('focused');
      });
      const el = document.querySelector(\`.comment-item[data-id="\${id}"]\`);
      if (el) {
        el.classList.add('focused');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function truncate(text, length) {
      if (text.length <= length) return text;
      return text.substring(0, length) + '...';
    }

    function formatDate(isoString) {
      const date = new Date(isoString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'refresh':
          comments = message.comments || [];
          renderComments();
          break;
        case 'focusComment':
          focusComment(message.commentId);
          break;
      }
    });

    // Initial render
    renderComments();
    
    // Setup toggle button
    document.getElementById('toggle-resolved').addEventListener('click', toggleResolved);
    
    // Tell extension we're ready to receive data
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
