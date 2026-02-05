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
  /** Array of usernames who gave thumbs up */
  thumbsUp?: string[];
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
  /** Whether the anchor text was deleted and can't be found */
  orphaned?: boolean;
  /** Array of usernames who gave thumbs up */
  thumbsUp?: string[];
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
  | { type: 'reAnchorComment'; commentId: string }
  | { type: 'editComment'; commentId: string; content: string }
  | { type: 'addReply'; commentId: string; content: string }
  | { type: 'editReply'; commentId: string; replyId: string; content: string }
  | { type: 'deleteReply'; commentId: string; replyId: string }
  | { type: 'commentDeleted'; commentId: string }
  | { type: 'commentUpdated'; comment: Comment }
  | { type: 'ready' }
  | { type: 'addComment' }
  | { type: 'showAddCommentForm'; hasSelection: boolean }
  | { type: 'submitNewComment'; content: string }
  | { type: 'toggleThumbsUpComment'; commentId: string }
  | { type: 'toggleThumbsUpReply'; commentId: string; replyId: string };
