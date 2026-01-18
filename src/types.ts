/**
 * Represents the anchor position of a comment in the document
 */
export interface CommentAnchor {
  /** The highlighted text snippet */
  text: string;
  /** Start line number (0-based) */
  startLine: number;
  /** Start character offset within the start line */
  startChar: number;
  /** End line number (0-based) */
  endLine: number;
  /** End character offset within the end line */
  endChar: number;
}

/**
 * Represents a reply to a comment
 */
export interface Reply {
  /** Unique identifier */
  id: string;
  /** The reply content/text */
  content: string;
  /** Author of the reply */
  author: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt?: string;
}

/**
 * Represents a single comment
 */
export interface Comment {
  /** Unique identifier */
  id: string;
  /** Position anchor in the document */
  anchor: CommentAnchor;
  /** The comment content/text */
  content: string;
  /** Author of the comment */
  author: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt?: string;
  /** Whether the comment is resolved */
  resolved?: boolean;
  /** Replies to this comment */
  replies?: Reply[];
}

/**
 * The comment data structure stored in the markdown file
 */
export interface CommentData {
  /** Schema version for future compatibility */
  version: number;
  /** Array of comments */
  comments: Comment[];
}

/**
 * Messages sent between extension and sidebar webview
 */
export type SidebarMessage =
  | { type: 'refresh'; comments: Comment[] }
  | { type: 'focusComment'; commentId: string }
  | { type: 'navigateToComment'; commentId: string }
  | { type: 'deleteComment'; commentId: string }
  | { type: 'resolveComment'; commentId: string }
  | { type: 'editComment'; commentId: string; content: string }
  | { type: 'requestEdit'; commentId: string }
  | { type: 'requestReply'; commentId: string }
  | { type: 'deleteReply'; commentId: string; replyId: string }
  | { type: 'requestEditReply'; commentId: string; replyId: string }
  | { type: 'commentDeleted'; commentId: string }
  | { type: 'commentUpdated'; comment: Comment }
  | { type: 'ready' };
