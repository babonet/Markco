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
 * Check if a position in text is inside a code fence (``` blocks)
 */
function isInsideCodeFence(text: string, position: number): boolean {
  const beforeText = text.substring(0, position);
  const fenceMatches = beforeText.match(/```/g);
  // If odd number of ``` before position, we're inside a code fence
  return fenceMatches !== null && fenceMatches.length % 2 === 1;
}

/**
 * Find the actual comment block position, ignoring those inside code fences
 */
function findCommentBlockStart(text: string): number {
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
export class CommentService {
  private commentCache: Map<string, Comment[]> = new Map();

  /**
   * Get the Git username from git config, with fallback to 'user'
   */
  private async getGitUserName(document: vscode.TextDocument): Promise<string> {
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
   * Reconcile comment anchors after document changes
   * Attempts to re-locate anchors by finding the anchor text near its expected position
   */
  async reconcileAnchors(document: vscode.TextDocument): Promise<void> {
    const comments = this.getComments(document);
    let modified = false;

    for (const comment of comments) {
      const newAnchor = this.findAnchorInDocument(document, comment.anchor);
      if (newAnchor && (
        newAnchor.startLine !== comment.anchor.startLine ||
        newAnchor.startChar !== comment.anchor.startChar ||
        newAnchor.endLine !== comment.anchor.endLine ||
        newAnchor.endChar !== comment.anchor.endChar
      )) {
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
  private findAnchorInDocument(
    document: vscode.TextDocument,
    anchor: CommentAnchor
  ): CommentAnchor | null {
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
  clearCache(document: vscode.TextDocument): void {
    this.commentCache.delete(document.uri.toString());
  }
}
