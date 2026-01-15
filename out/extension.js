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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const CommentService_1 = require("./services/CommentService");
const CommentDecorator_1 = require("./decorators/CommentDecorator");
const CommentSidebarProvider_1 = require("./providers/CommentSidebarProvider");
let commentService;
let commentDecorator;
let sidebarProvider;
function activate(context) {
    console.log('ComMark extension is now active');
    // Initialize services
    commentService = new CommentService_1.CommentService();
    commentDecorator = new CommentDecorator_1.CommentDecorator();
    // Initialize sidebar provider with callbacks
    sidebarProvider = new CommentSidebarProvider_1.CommentSidebarProvider(context.extensionUri, 
    // Navigate callback
    (commentId) => {
        console.log('ComMark: Navigate to comment:', commentId);
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            const comment = commentService.findComment(editor.document, commentId);
            console.log('ComMark: Found comment:', comment);
            if (comment) {
                commentDecorator.navigateToComment(editor, comment);
                refreshDecorations(editor);
            }
        }
        else {
            console.log('ComMark: No markdown editor active');
        }
    }, 
    // Delete callback
    async (commentId) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            await commentService.deleteComment(editor.document, commentId);
            refreshAll(editor);
        }
    }, 
    // Edit callback
    async (commentId, content) => {
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
    async (commentId) => {
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
    });
    // Register sidebar provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CommentSidebarProvider_1.CommentSidebarProvider.viewType, sidebarProvider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('commark.addComment', addCommentCommand));
    context.subscriptions.push(vscode.commands.registerCommand('commark.deleteComment', deleteCommentCommand));
    context.subscriptions.push(vscode.commands.registerCommand('commark.editComment', editCommentCommand));
    context.subscriptions.push(vscode.commands.registerCommand('commark.toggleSidebar', () => {
        vscode.commands.executeCommand('commark.commentSidebar.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('commark.navigateToComment', (commentId) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            const comment = commentService.findComment(editor.document, commentId);
            if (comment) {
                commentDecorator.navigateToComment(editor, comment);
                sidebarProvider.focusComment(commentId);
                refreshDecorations(editor);
            }
        }
    }));
    // Listen for active editor changes
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'markdown') {
            refreshAll(editor);
        }
    }));
    // Listen for document changes
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document && event.document.languageId === 'markdown') {
            // Debounce decoration updates
            refreshDecorations(editor);
        }
    }));
    // Listen for document saves to reconcile anchors
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (document.languageId === 'markdown') {
            await commentService.reconcileAnchors(document);
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
                refreshAll(editor);
            }
        }
    }));
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
    }
    else {
        vscode.window.showErrorMessage('Failed to add comment');
    }
}
async function deleteCommentCommand(commentId) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }
    if (!commentId) {
        // If no ID provided, try to find comment at cursor position
        const comments = commentService.getComments(editor.document);
        const comment = commentDecorator.findCommentAtPosition(editor.document, editor.selection.active, comments);
        if (comment) {
            commentId = comment.id;
        }
        else {
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
async function editCommentCommand(commentId) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }
    if (!commentId) {
        const comments = commentService.getComments(editor.document);
        const comment = commentDecorator.findCommentAtPosition(editor.document, editor.selection.active, comments);
        if (comment) {
            commentId = comment.id;
        }
        else {
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
function refreshAll(editor) {
    const comments = commentService.parseComments(editor.document);
    commentDecorator.applyDecorations(editor, comments);
    sidebarProvider.refresh(comments);
}
function refreshDecorations(editor) {
    const comments = commentService.getComments(editor.document);
    commentDecorator.applyDecorations(editor, comments);
}
function deactivate() {
    console.log('ComMark extension deactivated');
}
//# sourceMappingURL=extension.js.map