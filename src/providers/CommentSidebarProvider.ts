import * as vscode from 'vscode';
import { Comment, SidebarMessage } from '../types';

/**
 * Provides the webview sidebar for displaying and managing comments
 */
export class CommentSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'commark.commentSidebar';
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
    private readonly _onRequestEditReply?: (commentId: string, replyId: string) => void
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Comments</title>
</head>
<body>
  <div id="app">
    <div class="header">
      <h3>Comments <span id="comment-count">(0)</span></h3>
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

    function renderComments() {
      const container = document.getElementById('comments-list');
      const countEl = document.getElementById('comment-count');
      countEl.textContent = '(' + comments.length + ')';

      if (comments.length === 0) {
        container.innerHTML = \`
          <div class="no-comments">
            <p>No comments yet.</p>
            <p class="help-text">Select text and press <kbd>Ctrl+Shift+M</kbd> to add a comment.</p>
          </div>
        \`;
        return;
      }

      container.innerHTML = comments.map(comment => \`
        <div class="comment-item" data-id="\${comment.id}" onclick="navigateToComment('\${comment.id}')">
          <div class="comment-header">
            <span class="comment-author">\${escapeHtml(comment.author)}</span>
            <span class="comment-date">\${formatDate(comment.createdAt)}</span>
          </div>
          <div class="comment-content">\${escapeHtml(comment.content)}</div>
          <div class="comment-anchor">On: "\${escapeHtml(truncate(comment.anchor.text, 40))}"</div>
          <div class="comment-actions">
            <button class="btn-reply" onclick="event.stopPropagation(); startReply('\${comment.id}')">Reply</button>
            <button class="btn-edit" onclick="event.stopPropagation(); startEdit('\${comment.id}')">Edit</button>
            <button class="btn-delete" onclick="event.stopPropagation(); deleteComment('\${comment.id}')">Delete</button>
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
                <button class="btn-edit-reply" onclick="startEditReply('\${comment.id}', '\${reply.id}')">Edit</button>
                <button class="btn-delete-reply" onclick="deleteReply('\${comment.id}', '\${reply.id}')">Delete</button>
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
    
    // Tell extension we're ready to receive data
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
