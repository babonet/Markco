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
exports.CommentService = void 0;
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
const COMMENT_BLOCK_START = '<!-- commark-comments';
const COMMENT_BLOCK_END = '-->';
const CURRENT_VERSION = 1;
/**
 * Check if a position in text is inside a code fence (``` blocks)
 */
function isInsideCodeFence(text, position) {
    const beforeText = text.substring(0, position);
    const fenceMatches = beforeText.match(/```/g);
    // If odd number of ``` before position, we're inside a code fence
    return fenceMatches !== null && fenceMatches.length % 2 === 1;
}
/**
 * Find the actual comment block position, ignoring those inside code fences
 */
function findCommentBlockStart(text) {
    let searchStart = text.length;
    while (searchStart > 0) {
        const index = text.lastIndexOf(COMMENT_BLOCK_START, searchStart - 1);
        if (index === -1) {
            return -1;
        }
        // Check if this occurrence is inside a code fence
        if (!isInsideCodeFence(text, index)) {
            return index;
        }
        // Continue searching before this position
        searchStart = index;
    }
    return -1;
}
/**
 * Service for managing comments in markdown documents
 */
class CommentService {
    commentCache = new Map();
    /**
     * Parse comments from a markdown document
     */
    parseComments(document) {
        const uri = document.uri.toString();
        const text = document.getText();
        const startIndex = findCommentBlockStart(text);
        if (startIndex === -1) {
            this.commentCache.set(uri, []);
            return [];
        }
        const endIndex = text.indexOf(COMMENT_BLOCK_END, startIndex);
        if (endIndex === -1) {
            this.commentCache.set(uri, []);
            return [];
        }
        const jsonStart = startIndex + COMMENT_BLOCK_START.length;
        const jsonText = text.substring(jsonStart, endIndex).trim();
        try {
            const data = JSON.parse(jsonText);
            const comments = data.comments || [];
            this.commentCache.set(uri, comments);
            return comments;
        }
        catch (e) {
            console.error('Failed to parse comments:', e);
            this.commentCache.set(uri, []);
            return [];
        }
    }
    /**
     * Get cached comments for a document
     */
    getComments(document) {
        const uri = document.uri.toString();
        if (!this.commentCache.has(uri)) {
            return this.parseComments(document);
        }
        return this.commentCache.get(uri) || [];
    }
    /**
     * Save comments to a document
     */
    async saveComments(document, comments) {
        const uri = document.uri.toString();
        const text = document.getText();
        const data = {
            version: CURRENT_VERSION,
            comments
        };
        const jsonBlock = `${COMMENT_BLOCK_START}\n${JSON.stringify(data, null, 2)}\n${COMMENT_BLOCK_END}`;
        const edit = new vscode.WorkspaceEdit();
        const startIndex = findCommentBlockStart(text);
        if (startIndex === -1) {
            // No existing block, append at end
            const lastLine = document.lineCount - 1;
            const lastChar = document.lineAt(lastLine).text.length;
            const insertPosition = new vscode.Position(lastLine, lastChar);
            edit.insert(document.uri, insertPosition, '\n\n' + jsonBlock);
        }
        else {
            // Replace existing block
            const endIndex = text.indexOf(COMMENT_BLOCK_END, startIndex);
            if (endIndex !== -1) {
                const startPos = document.positionAt(startIndex);
                const endPos = document.positionAt(endIndex + COMMENT_BLOCK_END.length);
                edit.replace(document.uri, new vscode.Range(startPos, endPos), jsonBlock);
            }
        }
        const success = await vscode.workspace.applyEdit(edit);
        // Debug logging
        console.log('ComMark: applyEdit result:', success);
        console.log('ComMark: Inserting at end of file, startIndex was:', startIndex);
        // Update cache after successful edit
        if (success) {
            this.commentCache.set(uri, [...comments]);
        }
        return success;
    }
    /**
     * Add a new comment
     */
    async addComment(document, selection, content) {
        const selectedText = document.getText(selection);
        if (!selectedText.trim()) {
            return null;
        }
        const anchor = {
            text: selectedText,
            startLine: selection.start.line,
            startChar: selection.start.character,
            endLine: selection.end.line,
            endChar: selection.end.character
        };
        const comment = {
            id: (0, uuid_1.v4)(),
            anchor,
            content,
            author: 'user', // Could be extended to get from settings
            createdAt: new Date().toISOString()
        };
        const comments = this.getComments(document);
        comments.push(comment);
        const success = await this.saveComments(document, comments);
        return success ? comment : null;
    }
    /**
     * Delete a comment by ID
     */
    async deleteComment(document, commentId) {
        const comments = this.getComments(document);
        const index = comments.findIndex(c => c.id === commentId);
        if (index === -1) {
            return false;
        }
        comments.splice(index, 1);
        return this.saveComments(document, comments);
    }
    /**
     * Update a comment's content
     */
    async updateComment(document, commentId, newContent) {
        const comments = this.getComments(document);
        const comment = comments.find(c => c.id === commentId);
        if (!comment) {
            return null;
        }
        comment.content = newContent;
        comment.updatedAt = new Date().toISOString();
        const success = await this.saveComments(document, comments);
        return success ? comment : null;
    }
    /**
     * Find a comment by ID
     */
    findComment(document, commentId) {
        const comments = this.getComments(document);
        return comments.find(c => c.id === commentId);
    }
    /**
     * Reconcile comment anchors after document changes
     * Attempts to re-locate anchors by finding the anchor text near its expected position
     */
    async reconcileAnchors(document) {
        const comments = this.getComments(document);
        let modified = false;
        for (const comment of comments) {
            const newAnchor = this.findAnchorInDocument(document, comment.anchor);
            if (newAnchor && (newAnchor.startLine !== comment.anchor.startLine ||
                newAnchor.startChar !== comment.anchor.startChar ||
                newAnchor.endLine !== comment.anchor.endLine ||
                newAnchor.endChar !== comment.anchor.endChar)) {
                comment.anchor = newAnchor;
                modified = true;
            }
        }
        if (modified) {
            await this.saveComments(document, comments);
        }
    }
    /**
     * Find anchor text in document, searching near expected position first
     */
    findAnchorInDocument(document, anchor) {
        const searchText = anchor.text;
        // Full document search for multi-line text
        const fullText = document.getText();
        const index = fullText.indexOf(searchText);
        if (index !== -1) {
            const startPos = document.positionAt(index);
            const endPos = document.positionAt(index + searchText.length);
            return {
                text: searchText,
                startLine: startPos.line,
                startChar: startPos.character,
                endLine: endPos.line,
                endChar: endPos.character
            };
        }
        return null;
    }
    /**
     * Clear cache for a document
     */
    clearCache(document) {
        this.commentCache.delete(document.uri.toString());
    }
}
exports.CommentService = CommentService;
//# sourceMappingURL=CommentService.js.map