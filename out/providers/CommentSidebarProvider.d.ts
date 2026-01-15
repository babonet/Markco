import * as vscode from 'vscode';
import { Comment } from '../types';
/**
 * Provides the webview sidebar for displaying and managing comments
 */
export declare class CommentSidebarProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly _onNavigate;
    private readonly _onDelete;
    private readonly _onEdit;
    private readonly _onReady?;
    private readonly _onRequestEdit?;
    static readonly viewType = "commark.commentSidebar";
    private _view?;
    private _comments;
    private _focusedCommentId;
    constructor(_extensionUri: vscode.Uri, _onNavigate: (commentId: string) => void, _onDelete: (commentId: string) => void, _onEdit: (commentId: string, content: string) => void, _onReady?: (() => void) | undefined, _onRequestEdit?: ((commentId: string) => void) | undefined);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    /**
     * Refresh the sidebar with updated comments
     */
    refresh(comments: Comment[]): void;
    /**
     * Focus a specific comment in the sidebar
     */
    focusComment(commentId: string): void;
    private _getHtmlContent;
}
//# sourceMappingURL=CommentSidebarProvider.d.ts.map