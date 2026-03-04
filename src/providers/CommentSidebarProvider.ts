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
    private readonly _onAddReply?: (commentId: string, content: string) => void,
    private readonly _onEditReply?: (commentId: string, replyId: string, content: string) => void,
    private readonly _onDeleteReply?: (commentId: string, replyId: string) => void,
    private readonly _onResolve?: (commentId: string) => void,
    private readonly _onAddComment?: () => void,
    private readonly _onSubmitNewComment?: (content: string) => void,
    private readonly _onReAnchor?: (commentId: string) => void,
    private readonly _onThumbsUpComment?: (commentId: string) => void,
    private readonly _onThumbsUpReply?: (commentId: string, replyId: string) => void
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
        case 'addReply':
          if (this._onAddReply) {
            this._onAddReply(message.commentId, message.content);
          }
          break;
        case 'editReply':
          if (this._onEditReply) {
            this._onEditReply(message.commentId, message.replyId, message.content);
          }
          break;
        case 'deleteReply':
          if (this._onDeleteReply) {
            this._onDeleteReply(message.commentId, message.replyId);
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
        case 'addComment':
          if (this._onAddComment) {
            this._onAddComment();
          }
          break;
        case 'submitNewComment':
          if (this._onSubmitNewComment) {
            this._onSubmitNewComment(message.content);
          }
          break;
        case 'reAnchorComment':
          if (this._onReAnchor) {
            this._onReAnchor(message.commentId);
          }
          break;
        case 'toggleThumbsUpComment':
          if (this._onThumbsUpComment) {
            this._onThumbsUpComment(message.commentId);
          }
          break;
        case 'toggleThumbsUpReply':
          if (this._onThumbsUpReply) {
            this._onThumbsUpReply(message.commentId, message.replyId);
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
  public refresh(comments: Comment[], currentUser?: string): void {
    this._comments = comments;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'refresh',
        comments: comments,
        currentUser: currentUser
      });
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

  /**
   * Show the add comment form in the sidebar
   */
  public showAddCommentForm(hasSelection: boolean): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'showAddCommentForm',
        hasSelection: hasSelection
      } as SidebarMessage);
    }
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css')
    );

    // Load codicons locally from the bundled @vscode/codicons package
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'unsafe-inline';">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${codiconsUri}" rel="stylesheet">
  <title>Comments</title>
</head>
<body>
  <div id="app">
    <div class="header">
      <h3>Comments <span id="comment-count">(0)</span></h3>
      <div class="header-actions">
        <button id="add-comment-btn" class="btn-add" title="Add Comment (select text first)">
          <i class="codicon codicon-add"></i>
        </button>
        <button id="toggle-resolved" class="btn-toggle" title="Toggle resolved comments">
          <i class="codicon codicon-eye"></i>
        </button>
      </div>
    </div>
    
    <!-- Add Comment Form -->
    <div id="add-comment-form" class="input-form hidden">
      <div class="form-header">
        <span>New Comment</span>
        <button class="btn-icon btn-close" onclick="hideAddCommentForm()" title="Cancel">
          <i class="codicon codicon-close"></i>
        </button>
      </div>
      <div id="selection-warning" class="form-warning hidden">
        <i class="codicon codicon-warning"></i>
        <span>Please select text in the editor first</span>
      </div>
      <textarea id="new-comment-input" class="form-input" placeholder="Type your comment..." rows="3"></textarea>
      <div class="form-actions">
        <button class="btn-secondary" onclick="hideAddCommentForm()">Cancel</button>
        <button class="btn-primary" onclick="submitNewComment()">Add Comment</button>
      </div>
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
    let editingCommentId = null;
    let editingReplyId = null;
    let replyingToCommentId = null;
    let showResolved = true;
    let currentUser = null;

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

    function showAddCommentForm(hasSelection) {
      const form = document.getElementById('add-comment-form');
      const warning = document.getElementById('selection-warning');
      const input = document.getElementById('new-comment-input');
      
      form.classList.remove('hidden');
      
      if (!hasSelection) {
        warning.classList.remove('hidden');
        input.disabled = true;
      } else {
        warning.classList.add('hidden');
        input.disabled = false;
        input.focus();
      }
    }

    function hideAddCommentForm() {
      const form = document.getElementById('add-comment-form');
      const input = document.getElementById('new-comment-input');
      form.classList.add('hidden');
      input.value = '';
      input.disabled = false;
    }

    function submitNewComment() {
      const input = document.getElementById('new-comment-input');
      const content = input.value.trim();
      if (content) {
        vscode.postMessage({ type: 'submitNewComment', content: content });
        hideAddCommentForm();
      }
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
        <div class="comment-item \${comment.resolved ? 'resolved' : ''} \${comment.orphaned ? 'orphaned' : ''}" data-id="\${comment.id}" onclick="navigateToComment('\${comment.id}')">
          <div class="comment-header">
            <span class="comment-author">\${escapeHtml(comment.author)}</span>
            <span class="comment-date">\${formatDate(comment.createdAt)}</span>
          </div>
          \${comment.orphaned ? \`
            <div class="orphaned-warning">
              <i class="codicon codicon-warning"></i>
              <span>Anchor text deleted</span>
              <button class="btn-reanchor" onclick="event.stopPropagation(); reAnchorComment('\${comment.id}')" title="Select text in editor, then click to re-anchor">
                <i class="codicon codicon-pin"></i> Re-anchor
              </button>
            </div>
          \` : ''}
          \${editingCommentId === comment.id ? renderEditCommentForm(comment) : \`
            <div class="comment-content">\${escapeHtml(comment.content)}</div>
          \`}
          <div class="comment-anchor">On: "\${escapeHtml(truncate(comment.anchor.text, 40))}"</div>
          \${editingCommentId !== comment.id ? \`
            <div class="comment-actions">
              <div class="actions-left">
                <button class="btn-icon btn-reply" onclick="event.stopPropagation(); startReply('\${comment.id}')" title="Reply"><i class="codicon codicon-comment"></i></button>
                \${currentUser && comment.author === currentUser ? \`<button class="btn-icon btn-edit" onclick="event.stopPropagation(); startEditComment('\${comment.id}')" title="Edit"><i class="codicon codicon-edit"></i></button>\` : ''}
                <button class="btn-icon btn-thumbsup \${comment.thumbsUp && comment.thumbsUp.includes(currentUser) ? 'active' : ''}" onclick="event.stopPropagation(); toggleThumbsUpComment('\${comment.id}')" title="\${comment.thumbsUp && comment.thumbsUp.length ? comment.thumbsUp.join(', ') : 'No reactions'}"><i class="codicon codicon-thumbsup"></i>\${comment.thumbsUp && comment.thumbsUp.length > 1 ? \`<span class="thumbsup-count">\${comment.thumbsUp.length}</span>\` : ''}</button>
              </div>
              <div class="actions-right">
                <button class="btn-icon btn-resolve \${comment.resolved ? 'resolved' : ''}" onclick="event.stopPropagation(); resolveComment('\${comment.id}')" title="\${comment.resolved ? 'Reopen' : 'Resolve'}"><i class="codicon codicon-\${comment.resolved ? 'issue-reopened' : 'check'}"></i></button>
                <button class="btn-icon btn-delete" onclick="event.stopPropagation(); deleteComment('\${comment.id}')" title="Delete"><i class="codicon codicon-trash"></i></button>
              </div>
            </div>
          \` : ''}
          \${renderReplies(comment)}
          \${replyingToCommentId === comment.id ? renderReplyForm(comment.id) : ''}
        </div>
      \`).join('');
      
      // Focus on any active input
      setTimeout(() => {
        const activeInput = document.querySelector('.edit-input:not([disabled]), .reply-input:not([disabled])');
        if (activeInput) {
          activeInput.focus();
        }
      }, 0);
    }

    function renderEditCommentForm(comment) {
      return \`
        <div class="inline-form" onclick="event.stopPropagation()">
          <textarea class="edit-input" id="edit-comment-\${comment.id}" rows="2">\${escapeHtml(comment.content)}</textarea>
          <div class="inline-form-actions">
            <button class="btn-secondary btn-sm" onclick="cancelEditComment()">Cancel</button>
            <button class="btn-primary btn-sm" onclick="saveEditComment('\${comment.id}')">Save</button>
          </div>
        </div>
      \`;
    }

    function renderReplyForm(commentId) {
      return \`
        <div class="inline-form reply-form" onclick="event.stopPropagation()">
          <textarea class="reply-input" id="reply-input-\${commentId}" placeholder="Type your reply..." rows="2"></textarea>
          <div class="inline-form-actions">
            <button class="btn-secondary btn-sm" onclick="cancelReply()">Cancel</button>
            <button class="btn-primary btn-sm" onclick="submitReply('\${commentId}')">Reply</button>
          </div>
        </div>
      \`;
    }

    function renderEditReplyForm(commentId, reply) {
      return \`
        <div class="inline-form" onclick="event.stopPropagation()">
          <textarea class="edit-input" id="edit-reply-\${reply.id}" rows="2">\${escapeHtml(reply.content)}</textarea>
          <div class="inline-form-actions">
            <button class="btn-secondary btn-sm" onclick="cancelEditReply()">Cancel</button>
            <button class="btn-primary btn-sm" onclick="saveEditReply('\${commentId}', '\${reply.id}')">Save</button>
          </div>
        </div>
      \`;
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

    function reAnchorComment(id) {
      vscode.postMessage({ type: 'reAnchorComment', commentId: id });
    }

    function toggleThumbsUpComment(id) {
      vscode.postMessage({ type: 'toggleThumbsUpComment', commentId: id });
    }

    function toggleThumbsUpReply(commentId, replyId) {
      vscode.postMessage({ type: 'toggleThumbsUpReply', commentId: commentId, replyId: replyId });
    }

    function startEditComment(id) {
      editingCommentId = id;
      editingReplyId = null;
      replyingToCommentId = null;
      renderComments();
    }

    function cancelEditComment() {
      editingCommentId = null;
      renderComments();
    }

    function saveEditComment(id) {
      const input = document.getElementById('edit-comment-' + id);
      const content = input.value.trim();
      if (content) {
        vscode.postMessage({ type: 'editComment', commentId: id, content: content });
        editingCommentId = null;
      }
    }

    function startReply(commentId) {
      replyingToCommentId = commentId;
      editingCommentId = null;
      editingReplyId = null;
      renderComments();
    }

    function cancelReply() {
      replyingToCommentId = null;
      renderComments();
    }

    function submitReply(commentId) {
      const input = document.getElementById('reply-input-' + commentId);
      const content = input.value.trim();
      if (content) {
        vscode.postMessage({ type: 'addReply', commentId: commentId, content: content });
        replyingToCommentId = null;
      }
    }

    function startEditReply(commentId, replyId) {
      editingReplyId = { commentId, replyId };
      editingCommentId = null;
      replyingToCommentId = null;
      renderComments();
    }

    function cancelEditReply() {
      editingReplyId = null;
      renderComments();
    }

    function saveEditReply(commentId, replyId) {
      const input = document.getElementById('edit-reply-' + replyId);
      const content = input.value.trim();
      if (content) {
        vscode.postMessage({ type: 'editReply', commentId: commentId, replyId: replyId, content: content });
        editingReplyId = null;
      }
    }

    function deleteReply(commentId, replyId) {
      vscode.postMessage({ type: 'deleteReply', commentId: commentId, replyId: replyId });
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
              \${editingReplyId && editingReplyId.replyId === reply.id ? renderEditReplyForm(comment.id, reply) : \`
                <div class="reply-content">\${escapeHtml(reply.content)}</div>
                <div class="reply-actions">
                  \${currentUser && reply.author === currentUser ? \`<button class="btn-icon btn-edit-reply" onclick="startEditReply('\${comment.id}', '\${reply.id}')" title="Edit"><i class="codicon codicon-edit"></i></button>\` : ''}
                  <button class="btn-icon btn-thumbsup \${reply.thumbsUp && reply.thumbsUp.includes(currentUser) ? 'active' : ''}" onclick="toggleThumbsUpReply('\${comment.id}', '\${reply.id}')" title="\${reply.thumbsUp && reply.thumbsUp.length ? reply.thumbsUp.join(', ') : 'No reactions'}"><i class="codicon codicon-thumbsup"></i>\${reply.thumbsUp && reply.thumbsUp.length > 1 ? \`<span class="thumbsup-count">\${reply.thumbsUp.length}</span>\` : ''}</button>
                  <button class="btn-icon btn-delete-reply" onclick="deleteReply('\${comment.id}', '\${reply.id}')" title="Delete"><i class="codicon codicon-trash"></i></button>
                </div>
              \`}
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

    // Handle keyboard shortcuts in textareas
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (editingCommentId) {
          cancelEditComment();
        } else if (editingReplyId) {
          cancelEditReply();
        } else if (replyingToCommentId) {
          cancelReply();
        } else {
          hideAddCommentForm();
        }
      }
      
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const activeEl = document.activeElement;
        if (activeEl.id === 'new-comment-input') {
          submitNewComment();
        } else if (activeEl.classList.contains('edit-input')) {
          const id = activeEl.id.replace('edit-comment-', '').replace('edit-reply-', '');
          if (activeEl.id.startsWith('edit-comment-')) {
            saveEditComment(id);
          } else if (editingReplyId) {
            saveEditReply(editingReplyId.commentId, editingReplyId.replyId);
          }
        } else if (activeEl.classList.contains('reply-input')) {
          const commentId = activeEl.id.replace('reply-input-', '');
          submitReply(commentId);
        }
      }
    });

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'refresh':
          comments = message.comments || [];
          currentUser = message.currentUser || null;
          // Reset editing states on refresh
          editingCommentId = null;
          editingReplyId = null;
          replyingToCommentId = null;
          renderComments();
          break;
        case 'focusComment':
          focusComment(message.commentId);
          break;
        case 'showAddCommentForm':
          showAddCommentForm(message.hasSelection);
          break;
      }
    });

    // Initial render
    renderComments();
    
    // Setup toggle button
    document.getElementById('toggle-resolved').addEventListener('click', toggleResolved);
    
    // Setup add comment button
    document.getElementById('add-comment-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'addComment' });
    });
    
    // Tell extension we're ready to receive data
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
