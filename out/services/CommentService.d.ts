import * as vscode from 'vscode';
import { Comment } from '../types';
/**
 * Service for managing comments in markdown documents
 */
export declare class CommentService {
    private commentCache;
    /**
     * Parse comments from a markdown document
     */
    parseComments(document: vscode.TextDocument): Comment[];
    /**
     * Get cached comments for a document
     */
    getComments(document: vscode.TextDocument): Comment[];
    /**
     * Save comments to a document
     */
    saveComments(document: vscode.TextDocument, comments: Comment[]): Promise<boolean>;
    /**
     * Add a new comment
     */
    addComment(document: vscode.TextDocument, selection: vscode.Selection, content: string): Promise<Comment | null>;
    /**
     * Delete a comment by ID
     */
    deleteComment(document: vscode.TextDocument, commentId: string): Promise<boolean>;
    /**
     * Update a comment's content
     */
    updateComment(document: vscode.TextDocument, commentId: string, newContent: string): Promise<Comment | null>;
    /**
     * Find a comment by ID
     */
    findComment(document: vscode.TextDocument, commentId: string): Comment | undefined;
    /**
     * Reconcile comment anchors after document changes
     * Attempts to re-locate anchors by finding the anchor text near its expected position
     */
    reconcileAnchors(document: vscode.TextDocument): Promise<void>;
    /**
     * Find anchor text in document, searching near expected position first
     */
    private findAnchorInDocument;
    /**
     * Clear cache for a document
     */
    clearCache(document: vscode.TextDocument): void;
}
//# sourceMappingURL=CommentService.d.ts.map