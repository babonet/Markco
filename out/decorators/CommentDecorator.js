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
exports.CommentDecorator = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages text decorations for comment highlights in the editor
 */
class CommentDecorator {
    decorationType;
    focusedDecorationType;
    focusedCommentId = null;
    constructor() {
        this.decorationType = this.createDecorationType(false);
        this.focusedDecorationType = this.createDecorationType(true);
    }
    createDecorationType(isFocused) {
        const config = vscode.workspace.getConfiguration('commark');
        const baseColor = config.get('highlightColor', 'rgba(255, 212, 0, 0.3)');
        const borderColor = config.get('highlightBorderColor', 'rgba(255, 212, 0, 0.8)');
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: isFocused ? 'rgba(255, 212, 0, 0.5)' : baseColor,
            borderRadius: '3px',
            border: `1px solid ${borderColor}`,
            overviewRulerColor: borderColor,
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            cursor: 'pointer',
            ...(isFocused && {
                fontWeight: 'bold'
            })
        });
    }
    /**
     * Apply decorations for all comments in the editor
     */
    applyDecorations(editor, comments) {
        const normalRanges = [];
        const focusedRanges = [];
        for (const comment of comments) {
            const range = this.getCommentRange(editor.document, comment);
            if (!range) {
                continue;
            }
            const decorationOptions = {
                range,
                hoverMessage: new vscode.MarkdownString(`**Comment:** ${comment.content}`)
            };
            if (comment.id === this.focusedCommentId) {
                focusedRanges.push(decorationOptions);
            }
            else {
                normalRanges.push(decorationOptions);
            }
        }
        editor.setDecorations(this.decorationType, normalRanges);
        editor.setDecorations(this.focusedDecorationType, focusedRanges);
    }
    /**
     * Clear all decorations from the editor
     */
    clearDecorations(editor) {
        editor.setDecorations(this.decorationType, []);
        editor.setDecorations(this.focusedDecorationType, []);
    }
    /**
     * Set the focused comment for highlighting
     */
    setFocusedComment(commentId) {
        this.focusedCommentId = commentId;
    }
    /**
     * Get the focused comment ID
     */
    getFocusedCommentId() {
        return this.focusedCommentId;
    }
    /**
     * Get the range for a comment in the document
     */
    getCommentRange(document, comment) {
        const anchor = comment.anchor;
        // Handle both old format (line) and new format (startLine/endLine)
        const startLine = 'startLine' in anchor ? anchor.startLine : anchor.line;
        const endLine = 'endLine' in anchor ? anchor.endLine : anchor.line;
        // Validate line numbers
        if (startLine < 0 || startLine >= document.lineCount) {
            return null;
        }
        if (endLine < 0 || endLine >= document.lineCount) {
            return null;
        }
        // Create the range
        const startPos = new vscode.Position(startLine, anchor.startChar);
        const endPos = new vscode.Position(endLine, anchor.endChar);
        const range = new vscode.Range(startPos, endPos);
        // Verify the text still matches
        const textAtPosition = document.getText(range);
        if (textAtPosition === anchor.text) {
            return range;
        }
        // Text doesn't match, try to find it in the document
        const fullText = document.getText();
        const index = fullText.indexOf(anchor.text);
        if (index !== -1) {
            const foundStart = document.positionAt(index);
            const foundEnd = document.positionAt(index + anchor.text.length);
            return new vscode.Range(foundStart, foundEnd);
        }
        return null;
    }
    /**
     * Find which comment is at a given position (for click handling)
     */
    findCommentAtPosition(document, position, comments) {
        for (const comment of comments) {
            const range = this.getCommentRange(document, comment);
            if (range && range.contains(position)) {
                return comment;
            }
        }
        return undefined;
    }
    /**
     * Navigate to a comment in the editor
     */
    navigateToComment(editor, comment) {
        const range = this.getCommentRange(editor.document, comment);
        if (range) {
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(range.start, range.end);
            this.setFocusedComment(comment.id);
        }
    }
    /**
     * Dispose of decoration types
     */
    dispose() {
        this.decorationType.dispose();
        this.focusedDecorationType.dispose();
    }
}
exports.CommentDecorator = CommentDecorator;
//# sourceMappingURL=CommentDecorator.js.map