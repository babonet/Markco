"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Provides the webview sidebar for displaying and managing comments
 */
class CommentSidebarProvider {
    _extensionUri;
    _onNavigate;
    _onDelete;
    _onEdit;
    _onReady;
    _onRequestEdit;
    static viewType = 'commark.commentSidebar';
    _view;
    _comments = [];
    _focusedCommentId = null;
    constructor(_extensionUri, _onNavigate, _onDelete, _onEdit, _onReady, _onRequestEdit) {
        this._extensionUri = _extensionUri;
        this._onNavigate = _onNavigate;
        this._onDelete = _onDelete;
        this._onEdit = _onEdit;
        this._onReady = _onReady;
        this._onRequestEdit = _onRequestEdit;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlContent(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message) => {
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
    refresh(comments) {
        this._comments = comments;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'refresh',
                comments: comments
            });
        }
    }
    /**
     * Focus a specific comment in the sidebar
     */
    focusComment(commentId) {
        this._focusedCommentId = commentId;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'focusComment',
                commentId: commentId
            });
        }
    }
    _getHtmlContent(webview) {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css'));
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
            <button class="btn-edit" onclick="event.stopPropagation(); startEdit('\${comment.id}')">Edit</button>
            <button class="btn-delete" onclick="event.stopPropagation(); deleteComment('\${comment.id}')">Delete</button>
          </div>
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
exports.CommentSidebarProvider = CommentSidebarProvider;
//# sourceMappingURL=CommentSidebarProvider.js.map