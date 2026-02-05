import * as vscode from 'vscode';
import { Comment, CommentAnchor, CommentData, Reply } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COMMENT_BLOCK_START = '<!-- markco-comments';
const COMMENT_BLOCK_END = '-->';
const CURRENT_VERSION = 2;

/**
 * Sanitize text that will be stored in comments to prevent breaking the HTML comment block.
 * The main risk is the "-->" sequence which would prematurely close the HTML comment.
 */
function sanitizeForStorage(text: string): string {
  // Replace --> with a safe placeholder that won't break HTML comments
  return text.replace(/-->/g, '--\u200B>'); // Zero-width space between -- and >
}

/**
 * Restore sanitized text back to original form when reading.
 */
function restoreFromStorage(text: string): string {
  return text.replace(/--\u200B>/g, '-->');
}

/**
 * Check if a position in text is inside a code fence (``` blocks) or inline code (` `)
 */
function isInsideCodeContext(text: string, position: number): boolean {
  const beforeText = text.substring(0, position);
  
  // Check for code fences (``` blocks)
  const fenceMatches = beforeText.match(/```/g);
  if (fenceMatches !== null && fenceMatches.length % 2 === 1) {
    return true;
  }
  
  // Quick check: if there's a backtick immediately before position (like `<!-- markco-comments)
  // then we're inside inline code
  if (position > 0 && text[position - 1] === '`') {
    // Make sure it's not a code fence (```)
    if (!(position >= 3 && text.substring(position - 3, position) === '```')) {
      return true;
    }
  }
  
  // Check for inline code - find the last backtick before position
  // and check if there's a matching closing backtick after position on the same line
  const lastBacktickIndex = beforeText.lastIndexOf('`');
  if (lastBacktickIndex !== -1) {
    // Make sure it's not part of a code fence
    const isCodeFenceBacktick = beforeText.substring(lastBacktickIndex).startsWith('```');
    if (!isCodeFenceBacktick) {
      // Check if we're on the same line and there's a closing backtick
      const lineStart = beforeText.lastIndexOf('\n', lastBacktickIndex) + 1;
      const lineEnd = text.indexOf('\n', position);
      const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
      const positionInLine = position - lineStart;
      
      // Count backticks before and after position in this line
      const beforeInLine = line.substring(0, positionInLine);
      const afterInLine = line.substring(positionInLine);
      const backticksBeforeInLine = (beforeInLine.match(/(?<!`)`(?!`)/g) || []).length;
      const backticksAfterInLine = (afterInLine.match(/(?<!`)`(?!`)/g) || []).length;
      
      // If odd number of single backticks before position in line and at least one after, we're inside inline code
      if (backticksBeforeInLine % 2 === 1 && backticksAfterInLine > 0) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Find the actual comment block position, ignoring those inside code fences or inline code
 */
function findCommentBlockStart(text: string): number {
  let searchStart = text.length;
  
  while (searchStart > 0) {
    const index = text.lastIndexOf(COMMENT_BLOCK_START, searchStart - 1);
    if (index === -1) {
      return -1;
    }
    
    // Check if this occurrence is inside a code context (fence or inline)
    if (!isInsideCodeContext(text, index)) {
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
export class CommentService {
  private commentCache: Map<string, Comment[]> = new Map();

  /**
   * Get the Git username from git config, with fallback to 'user'
   */
  public async getGitUserName(document: vscode.TextDocument): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const cwd = workspaceFolder?.uri.fsPath ?? require('path').dirname(document.uri.fsPath);
      console.log('Markco: Getting git user.name from cwd:', cwd);
      const { stdout, stderr } = await execAsync('git config user.name', { cwd });
      if (stderr) {
        console.log('Markco: git config stderr:', stderr);
      }
      const name = stdout.trim();
      console.log('Markco: git config user.name result:', name || '(empty)');
      if (!name) {
        console.log('Markco: Git user.name is empty, falling back to "user"');
        return 'user';
      }
      return name;
    } catch (error) {
      console.error('Markco: Failed to get git user.name:', error);
      return 'user';
    }
  }

  /**
   * Parse comments from a markdown document
   */
  parseComments(document: vscode.TextDocument): Comment[] {
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

    // Validate that the content looks like a JSON object before parsing
    // This prevents errors when finding the marker inside inline code like `<!-- markco-comments ... -->`
    if (!jsonText.startsWith('{')) {
      this.commentCache.set(uri, []);
      return [];
    }

    try {
      const data: CommentData = JSON.parse(jsonText);
      // Restore any sanitized text back to original form
      const comments = (data.comments || []).map(c => ({
        ...c,
        anchor: { ...c.anchor, text: restoreFromStorage(c.anchor.text) },
        content: restoreFromStorage(c.content),
        replies: c.replies?.map(r => ({
          ...r,
          content: restoreFromStorage(r.content)
        }))
      }));
      this.commentCache.set(uri, comments);
      return comments;
    } catch (e) {
      console.error('Failed to parse comments:', e);
      this.commentCache.set(uri, []);
      return [];
    }
  }

  /**
   * Get cached comments for a document
   */
  getComments(document: vscode.TextDocument): Comment[] {
    const uri = document.uri.toString();
    if (!this.commentCache.has(uri)) {
      return this.parseComments(document);
    }
    return this.commentCache.get(uri) || [];
  }

  /**
   * Save comments to a document
   */
  async saveComments(document: vscode.TextDocument, comments: Comment[]): Promise<boolean> {
    const uri = document.uri.toString();
    
    const text = document.getText();
    
    // Sanitize comments before saving to prevent breaking HTML comment block
    const sanitizedComments = comments.map(c => ({
      ...c,
      anchor: { ...c.anchor, text: sanitizeForStorage(c.anchor.text) },
      content: sanitizeForStorage(c.content),
      replies: c.replies?.map(r => ({
        ...r,
        content: sanitizeForStorage(r.content)
      }))
    }));
    
    const data: CommentData = {
      version: CURRENT_VERSION,
      comments: sanitizedComments
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
    } else {
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
    console.log('Markco: applyEdit result:', success);
    console.log('Markco: Inserting at end of file, startIndex was:', startIndex);
    
    // Update cache after successful edit
    if (success) {
      this.commentCache.set(uri, [...comments]);
    }
    
    return success;
  }

  /**
   * Add a new comment
   */
  async addComment(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    content: string
  ): Promise<Comment | null> {
    const selectedText = document.getText(selection);
    if (!selectedText.trim()) {
      return null;
    }

    const anchor: CommentAnchor = {
      text: selectedText,
      startLine: selection.start.line,
      startChar: selection.start.character,
      endLine: selection.end.line,
      endChar: selection.end.character
    };

    const author = await this.getGitUserName(document);

    const comment: Comment = {
      id: uuidv4(),
      anchor,
      content,
      author,
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
  async deleteComment(document: vscode.TextDocument, commentId: string): Promise<boolean> {
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
  async updateComment(
    document: vscode.TextDocument,
    commentId: string,
    newContent: string
  ): Promise<Comment | null> {
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
  findComment(document: vscode.TextDocument, commentId: string): Comment | undefined {
    const comments = this.getComments(document);
    return comments.find(c => c.id === commentId);
  }

  /**
   * Add a reply to a comment
   */
  async addReply(
    document: vscode.TextDocument,
    commentId: string,
    content: string
  ): Promise<Reply | null> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment) {
      return null;
    }

    const author = await this.getGitUserName(document);

    const reply: Reply = {
      id: uuidv4(),
      content,
      author,
      createdAt: new Date().toISOString()
    };

    if (!comment.replies) {
      comment.replies = [];
    }
    comment.replies.push(reply);

    const success = await this.saveComments(document, comments);
    return success ? reply : null;
  }

  /**
   * Delete a reply from a comment (cascade: deleting parent comment deletes all replies)
   */
  async deleteReply(
    document: vscode.TextDocument,
    commentId: string,
    replyId: string
  ): Promise<boolean> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment || !comment.replies) {
      return false;
    }

    const replyIndex = comment.replies.findIndex(r => r.id === replyId);
    if (replyIndex === -1) {
      return false;
    }

    comment.replies.splice(replyIndex, 1);
    return this.saveComments(document, comments);
  }

  /**
   * Update a reply's content
   */
  async updateReply(
    document: vscode.TextDocument,
    commentId: string,
    replyId: string,
    newContent: string
  ): Promise<Reply | null> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment || !comment.replies) {
      return null;
    }

    const reply = comment.replies.find(r => r.id === replyId);
    if (!reply) {
      return null;
    }

    reply.content = newContent;
    reply.updatedAt = new Date().toISOString();

    const success = await this.saveComments(document, comments);
    return success ? reply : null;
  }

  /**
   * Find a reply by ID within a comment
   */
  findReply(
    document: vscode.TextDocument,
    commentId: string,
    replyId: string
  ): Reply | undefined {
    const comment = this.findComment(document, commentId);
    if (!comment || !comment.replies) {
      return undefined;
    }
    return comment.replies.find(r => r.id === replyId);
  }

  /**
   * Toggle thumbs up on a comment for the current user.
   * Adds the user if not present, removes if already present.
   */
  async toggleThumbsUpComment(
    document: vscode.TextDocument,
    commentId: string
  ): Promise<Comment | null> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment) {
      return null;
    }

    const author = await this.getGitUserName(document);
    
    if (!comment.thumbsUp) {
      comment.thumbsUp = [];
    }

    const index = comment.thumbsUp.indexOf(author);
    if (index === -1) {
      // Add thumbs up
      comment.thumbsUp.push(author);
    } else {
      // Remove thumbs up
      comment.thumbsUp.splice(index, 1);
    }

    // Clean up empty array
    if (comment.thumbsUp.length === 0) {
      delete comment.thumbsUp;
    }

    const success = await this.saveComments(document, comments);
    return success ? comment : null;
  }

  /**
   * Toggle thumbs up on a reply for the current user.
   * Adds the user if not present, removes if already present.
   */
  async toggleThumbsUpReply(
    document: vscode.TextDocument,
    commentId: string,
    replyId: string
  ): Promise<Reply | null> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment || !comment.replies) {
      return null;
    }

    const reply = comment.replies.find(r => r.id === replyId);
    if (!reply) {
      return null;
    }

    const author = await this.getGitUserName(document);

    if (!reply.thumbsUp) {
      reply.thumbsUp = [];
    }

    const index = reply.thumbsUp.indexOf(author);
    if (index === -1) {
      // Add thumbs up
      reply.thumbsUp.push(author);
    } else {
      // Remove thumbs up
      reply.thumbsUp.splice(index, 1);
    }

    // Clean up empty array
    if (reply.thumbsUp.length === 0) {
      delete reply.thumbsUp;
    }

    const success = await this.saveComments(document, comments);
    return success ? reply : null;
  }

  /**
   * Toggle the resolved status of a comment
   */
  async resolveComment(
    document: vscode.TextDocument,
    commentId: string
  ): Promise<Comment | null> {
    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment) {
      return null;
    }

    comment.resolved = !comment.resolved;
    comment.updatedAt = new Date().toISOString();

    const success = await this.saveComments(document, comments);
    return success ? comment : null;
  }

  /**
   * Re-anchor a comment to a new selection
   */
  async reAnchorComment(
    document: vscode.TextDocument,
    commentId: string,
    selection: vscode.Selection
  ): Promise<Comment | null> {
    const selectedText = document.getText(selection);
    if (!selectedText.trim()) {
      return null;
    }

    const comments = this.getComments(document);
    const comment = comments.find(c => c.id === commentId);

    if (!comment) {
      return null;
    }

    // Update anchor with new selection
    comment.anchor = {
      text: selectedText,
      startLine: selection.start.line,
      startChar: selection.start.character,
      endLine: selection.end.line,
      endChar: selection.end.character
    };
    comment.orphaned = false;
    comment.updatedAt = new Date().toISOString();

    const success = await this.saveComments(document, comments);
    return success ? comment : null;
  }

  /**
   * Reconcile comment anchors after document changes
   * Attempts to re-locate anchors by finding the anchor text near its expected position
   * Marks comments as orphaned if their anchor text can no longer be found
   */
  async reconcileAnchors(document: vscode.TextDocument): Promise<void> {
    const comments = this.getComments(document);
    let modified = false;

    for (const comment of comments) {
      const newAnchor = this.findAnchorInDocument(document, comment.anchor);
      if (newAnchor) {
        // Anchor found - update position if changed and clear orphaned flag
        if (
          newAnchor.startLine !== comment.anchor.startLine ||
          newAnchor.startChar !== comment.anchor.startChar ||
          newAnchor.endLine !== comment.anchor.endLine ||
          newAnchor.endChar !== comment.anchor.endChar ||
          comment.orphaned
        ) {
          comment.anchor = newAnchor;
          comment.orphaned = false;
          modified = true;
        }
      } else if (!comment.orphaned) {
        // Anchor text not found - mark as orphaned
        comment.orphaned = true;
        modified = true;
      }
    }

    if (modified) {
      await this.saveComments(document, comments);
    }
  }

  /**
   * Find anchor text in document, searching near expected position first
   * Excludes the markco comment block to prevent false matches against stored anchor text
   */
  private findAnchorInDocument(
    document: vscode.TextDocument,
    anchor: CommentAnchor
  ): CommentAnchor | null {
    const searchText = anchor.text;
    
    // Get document text, but exclude the markco comment block to prevent matching anchor text
    // that appears in the JSON storage (which would cause anchors to point to the comment block)
    const fullText = document.getText();
    const commentBlockStart = findCommentBlockStart(fullText);
    
    let searchableText: string;
    if (commentBlockStart !== -1) {
      // Find the end of the markco comment block
      const commentBlockEnd = fullText.indexOf(COMMENT_BLOCK_END, commentBlockStart);
      if (commentBlockEnd !== -1) {
        // Exclude only the markco block, keep content before and after
        searchableText = fullText.substring(0, commentBlockStart) + 
                         fullText.substring(commentBlockEnd + COMMENT_BLOCK_END.length);
      } else {
        // No closing tag found, exclude from start to end
        searchableText = fullText.substring(0, commentBlockStart);
      }
    } else {
      searchableText = fullText;
    }
    
    const index = searchableText.indexOf(searchText);
    if (index !== -1) {
      // The index is in the searchable text (with markco block removed)
      // We need to map back to the original document position
      // If the match is before the comment block, the position is the same
      // If the match would be after where the comment block was, we need to adjust
      let originalIndex = index;
      if (commentBlockStart !== -1 && index >= commentBlockStart) {
        // The match is in text that was after the comment block
        // Add back the length of the removed comment block
        const commentBlockEnd = fullText.indexOf(COMMENT_BLOCK_END, commentBlockStart);
        if (commentBlockEnd !== -1) {
          const removedLength = (commentBlockEnd + COMMENT_BLOCK_END.length) - commentBlockStart;
          originalIndex = index + removedLength;
        }
      }
      
      const startPos = document.positionAt(originalIndex);
      const endPos = document.positionAt(originalIndex + searchText.length);
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
  clearCache(document: vscode.TextDocument): void {
    this.commentCache.delete(document.uri.toString());
  }
}
