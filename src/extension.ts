import * as vscode from 'vscode';
import { CommentService } from './services/CommentService';
import { CommentDecorator } from './decorators/CommentDecorator';
import { CommentSidebarProvider } from './providers/CommentSidebarProvider';

let commentService: CommentService;
let commentDecorator: CommentDecorator;
let sidebarProvider: CommentSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Markco extension is now active');

  // Initialize services
  commentService = new CommentService();
  commentDecorator = new CommentDecorator();

  // Initialize sidebar provider with callbacks
  sidebarProvider = new CommentSidebarProvider(
    context.extensionUri,
    // Navigate callback
    (commentId: string) => {
      console.log('Markco: Navigate to comment:', commentId);
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        const comment = commentService.findComment(editor.document, commentId);
        console.log('Markco: Found comment:', comment);
        if (comment) {
          commentDecorator.navigateToComment(editor, comment);
          refreshDecorations(editor);
        }
      } else {
        console.log('Markco: No markdown editor active');
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
    // Edit callback - now receives content directly from sidebar
    async (commentId: string, content: string) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        await commentService.updateComment(editor.document, commentId, content);
        refreshAll(editor);
        vscode.window.showInformationMessage('Comment updated');
      }
    },
    // Ready callback - sidebar is ready to receive data
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        refreshAll(editor);
      }
    },
    // Add reply callback - receives content directly from sidebar
    async (commentId: string, content: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const reply = await commentService.addReply(editor.document, commentId, content);
      if (reply) {
        refreshAll(editor);
        vscode.window.showInformationMessage('Reply added');
      }
    },
    // Edit reply callback - receives content directly from sidebar
    async (commentId: string, replyId: string, content: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      await commentService.updateReply(editor.document, commentId, replyId, content);
      refreshAll(editor);
      vscode.window.showInformationMessage('Reply updated');
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
    // Resolve comment callback
    async (commentId: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        return;
      }

      const comment = await commentService.resolveComment(editor.document, commentId);
      if (comment) {
        refreshAll(editor);
        const action = comment.resolved ? 'resolved' : 'reopened';
        vscode.window.showInformationMessage(`Comment ${action}`);
      }
    },
    // Add comment callback - triggered from sidebar button, shows form in sidebar
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Please open a Markdown file to add comments');
        return;
      }
      
      if (editor.selection.isEmpty) {
        vscode.window.showErrorMessage('Please select some text to comment on');
        return;
      }
      
      sidebarProvider.showAddCommentForm(true);
    },
    // Submit new comment callback - receives content from sidebar form
    async (content: string) => {
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

      const comment = await commentService.addComment(editor.document, selection, content);
      if (comment) {
        refreshAll(editor);
        vscode.window.showInformationMessage('Comment added successfully');
      } else {
        vscode.window.showErrorMessage('Failed to add comment');
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
    vscode.commands.registerCommand('markco.addComment', addCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markco.deleteComment', deleteCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markco.editComment', editCommentCommand)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markco.toggleSidebar', () => {
      vscode.commands.executeCommand('markco.commentSidebar.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markco.navigateToComment', (commentId: string) => {
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

  // Show the sidebar and open the add comment form
  await vscode.commands.executeCommand('markco.commentSidebar.focus');
  sidebarProvider.showAddCommentForm(true);
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

  // Focus the sidebar and navigate to the comment for inline editing
  await vscode.commands.executeCommand('markco.commentSidebar.focus');
  sidebarProvider.focusComment(commentId);
}

function refreshAll(editor: vscode.TextEditor) {
  const comments = commentService.parseComments(editor.document);
  commentDecorator.applyDecorations(editor, comments);
  // Sort comments by line number for logical sidebar ordering
  const sortedComments = [...comments].sort((a, b) => {
    if (a.anchor.startLine !== b.anchor.startLine) {
      return a.anchor.startLine - b.anchor.startLine;
    }
    return a.anchor.startChar - b.anchor.startChar;
  });
  sidebarProvider.refresh(sortedComments);
}

function refreshDecorations(editor: vscode.TextEditor) {
  const comments = commentService.getComments(editor.document);
  commentDecorator.applyDecorations(editor, comments);
}

export function deactivate() {
  console.log('Markco extension deactivated');
}
