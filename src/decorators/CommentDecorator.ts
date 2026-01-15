import * as vscode from 'vscode';
import { Comment } from '../types';

/**
 * Manages text decorations for comment highlights in the editor
 */
export class CommentDecorator {
  private decorationType: vscode.TextEditorDecorationType;
  private focusedDecorationType: vscode.TextEditorDecorationType;
  private focusedCommentId: string | null = null;

  constructor() {
    this.decorationType = this.createDecorationType(false);
    this.focusedDecorationType = this.createDecorationType(true);
  }

  private createDecorationType(isFocused: boolean): vscode.TextEditorDecorationType {
    const config = vscode.workspace.getConfiguration('commark');
    const baseColor = config.get<string>('highlightColor', 'rgba(255, 212, 0, 0.3)');
    const borderColor = config.get<string>('highlightBorderColor', 'rgba(255, 212, 0, 0.8)');

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
  applyDecorations(editor: vscode.TextEditor, comments: Comment[]): void {
    const normalRanges: vscode.DecorationOptions[] = [];
    const focusedRanges: vscode.DecorationOptions[] = [];

    for (const comment of comments) {
      const range = this.getCommentRange(editor.document, comment);
      if (!range) {
        continue;
      }

      const decorationOptions: vscode.DecorationOptions = {
        range,
        hoverMessage: new vscode.MarkdownString(`**Comment:** ${comment.content}`)
      };

      if (comment.id === this.focusedCommentId) {
        focusedRanges.push(decorationOptions);
      } else {
        normalRanges.push(decorationOptions);
      }
    }

    editor.setDecorations(this.decorationType, normalRanges);
    editor.setDecorations(this.focusedDecorationType, focusedRanges);
  }

  /**
   * Clear all decorations from the editor
   */
  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorationType, []);
    editor.setDecorations(this.focusedDecorationType, []);
  }

  /**
   * Set the focused comment for highlighting
   */
  setFocusedComment(commentId: string | null): void {
    this.focusedCommentId = commentId;
  }

  /**
   * Get the focused comment ID
   */
  getFocusedCommentId(): string | null {
    return this.focusedCommentId;
  }

  /**
   * Get the range for a comment in the document
   */
  private getCommentRange(document: vscode.TextDocument, comment: Comment): vscode.Range | null {
    const anchor = comment.anchor;

    // Handle both old format (line) and new format (startLine/endLine)
    const startLine = 'startLine' in anchor ? anchor.startLine : (anchor as any).line;
    const endLine = 'endLine' in anchor ? anchor.endLine : (anchor as any).line;

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
  findCommentAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    comments: Comment[]
  ): Comment | undefined {
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
  navigateToComment(editor: vscode.TextEditor, comment: Comment): void {
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
  dispose(): void {
    this.decorationType.dispose();
    this.focusedDecorationType.dispose();
  }
}
