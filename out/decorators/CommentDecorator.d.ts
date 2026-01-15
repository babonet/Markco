import * as vscode from 'vscode';
import { Comment } from '../types';
/**
 * Manages text decorations for comment highlights in the editor
 */
export declare class CommentDecorator {
    private decorationType;
    private focusedDecorationType;
    private focusedCommentId;
    constructor();
    private createDecorationType;
    /**
     * Apply decorations for all comments in the editor
     */
    applyDecorations(editor: vscode.TextEditor, comments: Comment[]): void;
    /**
     * Clear all decorations from the editor
     */
    clearDecorations(editor: vscode.TextEditor): void;
    /**
     * Set the focused comment for highlighting
     */
    setFocusedComment(commentId: string | null): void;
    /**
     * Get the focused comment ID
     */
    getFocusedCommentId(): string | null;
    /**
     * Get the range for a comment in the document
     */
    private getCommentRange;
    /**
     * Find which comment is at a given position (for click handling)
     */
    findCommentAtPosition(document: vscode.TextDocument, position: vscode.Position, comments: Comment[]): Comment | undefined;
    /**
     * Navigate to a comment in the editor
     */
    navigateToComment(editor: vscode.TextEditor, comment: Comment): void;
    /**
     * Dispose of decoration types
     */
    dispose(): void;
}
//# sourceMappingURL=CommentDecorator.d.ts.map