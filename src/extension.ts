import * as vscode from 'vscode';
import { CommentService } from './services/CommentService';
import { CommentDecorator } from './decorators/CommentDecorator';
import { CommentSidebarProvider } from './providers/CommentSidebarProvider';

let commentService: CommentService;
let commentDecorator: CommentDecorator;
let sidebarProvider: CommentSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('ComMark extension is now active');

  // Initialize services
  commentService = new CommentService();
  commentDecorator = new CommentDecorator();

  // Initialize sidebar provider with callbacks
  sidebarProvider = new CommentSidebarProvider(
    context.extensionUri,
    // Navigate callback
    (commentId: string) => {
      console.log('ComMark: Navigate to comment:', commentId);
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const comment = commentService.findComment(editor.document, commentId);
        console.log('ComMark: Found comment:', comment);
        if (comment) {
          commentDecorator.navigateToComment(editor, comment);
          refreshDecorations(editor);
        }
      } else {
        console.log('ComMark: No markdown editor active');
      }
    },
    // Delete callback
    async (commentId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        await commentService.deleteComment(editor.document, commentId);
        refreshAll(editor);
      }
    },
    // Edit callback
    async (commentId: string, content: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        await commentService.updateComment(editor.document, commentId, content);
        refreshAll(editor);
      }
    },
    // Ready callback - sidebar is ready to receive data
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        refreshAll(editor);
      }
    },
    // Request edit callback - show VS Code input box for editing
    async (commentId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const comment = commentService.findComment(editor.document, commentId);
      if (!comment) {
        return;
      }

      const newContent = await vscode.window.showInputBox({
        prompt: 'Edit your comment',
        value: comment.content,
        validateInput: (value) => {
          return value.trim() ? null : 'Comment cannot be empty';
        }
      });

      if (newContent && newContent.trim() !== comment.content) {
        await commentService.updateComment(editor.document, commentId, newContent.trim());
        refreshAll(editor);
        vscode.window.showInformationMessage('Comment updated');
      }
    },
    // Request reply callback - show VS Code input box for adding a reply
    async (commentId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const replyContent = await vscode.window.showInputBox({
        prompt: 'Enter your reply',
        placeHolder: 'Type your reply here...',
        validateInput: (value) => {
          return value.trim() ? null : 'Reply cannot be empty';
        }
      });

      if (replyContent) {
        const reply = await commentService.addReply(editor.document, commentId, replyContent.trim());
        if (reply) {
          refreshAll(editor);
          vscode.window.showInformationMessage('Reply added');
        }
      }
    },
    // Delete reply callback
    async (commentId: string, replyId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const success = await commentService.deleteReply(editor.document, commentId, replyId);
      if (success) {
        refreshAll(editor);
        vscode.window.showInformationMessage('Reply deleted');
      }
    },
    // Request edit reply callback - show VS Code input box for editing a reply
    async (commentId: string, replyId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const reply = commentService.findReply(editor.document, commentId, replyId);
      if (!reply) {
        return;
      }

      const newContent = await vscode.window.showInputBox({
        prompt: 'Edit your reply',
        value: reply.content,
        validateInput: (value) => {
          return value.trim() ? null : 'Reply cannot be empty';
        }
      });

      if (newContent && newContent.trim() !== reply.content) {
        await commentService.updateReply(editor.document, commentId, replyId, newContent.trim());
        refreshAll(editor);
        vscode.window.showInformationMessage('Reply updated');
      }
    }
  );

  // Register sidebar provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommentSidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('commark.addComment', addCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commark.deleteComment', deleteCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commark.editComment', editCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commark.toggleSidebar', () => {
      vscode.commands.executeCommand('commark.commentSidebar.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('commark.navigateToComment', (commentId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const comment = commentService.findComment(editor.document, commentId);
        if (comment) {
          commentDecorator.navigateToComment(editor, comment);
          sidebarProvider.focusComment(commentId);
          refreshDecorations(editor);
        }
      }
    })
  );

  // Listen for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'markdown') {
        refreshAll(editor);
      }
    })
  );

  // Listen for document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document && event.document.languageId === 'markdown') {
        // Debounce decoration updates
        refreshDecorations(editor);
      }
    })
  );

  // Listen for document saves to reconcile anchors
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (document.languageId === 'markdown') {
        await commentService.reconcileAnchors(document);
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
          refreshAll(editor);
        }
      }
    })
  );

  // Initial refresh if markdown file is already open
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'markdown') {
    refreshAll(editor);
  }

  // Cleanup
  context.subscriptions.push({
    dispose: () => {
      commentDecorator.dispose();
    }
  });
}

async function addCommentCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Please open a Markdown file to add comments');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showErrorMessage('Please select some text to comment on');
    return;
  }

  const content = await vscode.window.showInputBox({
    prompt: 'Enter your comment',
    placeHolder: 'Type your comment here...',
    validateInput: (value) => {
      return value.trim() ? null : 'Comment cannot be empty';
    }
  });

  if (!content) {
    return;
  }

  const comment = await commentService.addComment(editor.document, selection, content.trim());
  if (comment) {
    refreshAll(editor);
    vscode.window.showInformationMessage('Comment added successfully');
  } else {
    vscode.window.showErrorMessage('Failed to add comment');
  }
}

async function deleteCommentCommand(commentId?: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  if (!commentId) {
    // If no ID provided, try to find comment at cursor position
    const comments = commentService.getComments(editor.document);
    const comment = commentDecorator.findCommentAtPosition(
      editor.document,
      editor.selection.active,
      comments
    );
    if (comment) {
      commentId = comment.id;
    } else {
      vscode.window.showErrorMessage('No comment found at cursor position');
      return;
    }
  }

  const success = await commentService.deleteComment(editor.document, commentId);
  if (success) {
    refreshAll(editor);
    vscode.window.showInformationMessage('Comment deleted');
  }
}

async function editCommentCommand(commentId?: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    return;
  }

  if (!commentId) {
    const comments = commentService.getComments(editor.document);
    const comment = commentDecorator.findCommentAtPosition(
      editor.document,
      editor.selection.active,
      comments
    );
    if (comment) {
      commentId = comment.id;
    } else {
      vscode.window.showErrorMessage('No comment found at cursor position');
      return;
    }
  }

  const comment = commentService.findComment(editor.document, commentId);
  if (!comment) {
    return;
  }

  const newContent = await vscode.window.showInputBox({
    prompt: 'Edit your comment',
    value: comment.content,
    validateInput: (value) => {
      return value.trim() ? null : 'Comment cannot be empty';
    }
  });

  if (newContent && newContent.trim() !== comment.content) {
    await commentService.updateComment(editor.document, commentId, newContent.trim());
    refreshAll(editor);
    vscode.window.showInformationMessage('Comment updated');
  }
}

function refreshAll(editor: vscode.TextEditor) {
  const comments = commentService.parseComments(editor.document);
  commentDecorator.applyDecorations(editor, comments);
  sidebarProvider.refresh(comments);
}

function refreshDecorations(editor: vscode.TextEditor) {
  const comments = commentService.getComments(editor.document);
  commentDecorator.applyDecorations(editor, comments);
}

export function deactivate() {
  console.log('ComMark extension deactivated');
}
