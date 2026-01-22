/**
 * markdown-it plugin for Markco preview highlighting.
 * 
 * This plugin parses the markco-comments JSON block from markdown files
 * and wraps commented anchor text in <span class="markco-highlight"> elements
 * for visual indication in the VS Code Markdown preview.
 * 
 * Uses token.map for line-level matching to handle duplicate text accurately.
 */

import type MarkdownIt from 'markdown-it';

// Token interface based on markdown-it's token structure
interface Token {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  map?: [number, number] | null;
  children?: Token[] | null;
}

// Token constructor type
interface TokenConstructor {
  new(type: string, tag: string, nesting: number): Token;
}

interface CommentAnchor {
  text: string;
  startLine: number;  // 0-based
  startChar: number;
  endLine: number;
  endChar: number;
}

interface Comment {
  id: string;
  anchor: CommentAnchor;
  content: string;
  orphaned?: boolean;
  resolved?: boolean;
}

interface CommentData {
  version: number;
  comments: Comment[];
}

const COMMENT_BLOCK_START = '<!-- markco-comments';
const COMMENT_BLOCK_END = '-->';

/**
 * Restores text that was sanitized for storage.
 * Converts zero-width space sequences back to normal.
 */
function restoreFromStorage(text: string): string {
  return text.replace(/--\u200B>/g, '-->');
}

/**
 * Normalizes anchor text by stripping markdown syntax that doesn't appear
 * in the parsed token content:
 * - Backticks (inline code markers)
 * - List number prefixes (e.g., "1. ", "2. ")
 * - Bold/italic markers (* and _)
 */
function normalizeAnchorText(text: string): string {
  let normalized = text;
  
  // Remove list number prefixes like "1. ", "2. ", "10. " at the start
  normalized = normalized.replace(/^\d+\.\s+/, '');
  
  // Remove bullet prefixes like "- ", "* " at the start
  normalized = normalized.replace(/^[-*]\s+/, '');
  
  // Remove backticks (inline code markers)
  normalized = normalized.replace(/`/g, '');
  
  // Remove bold markers (** or __)
  normalized = normalized.replace(/\*\*|__/g, '');
  
  // Remove italic markers (* or _) - be careful not to remove underscores in words
  // Only remove standalone * or _ used for emphasis
  normalized = normalized.replace(/(?<!\w)\*(?!\*)|\*(?!\w)/g, '');
  normalized = normalized.replace(/(?<!\w)_(?!_)|_(?!\w)/g, '');
  
  return normalized;
}

/**
 * Checks if a position in the source is inside a code fence.
 */
function isInsideCodeFence(text: string, position: number): boolean {
  const textBefore = text.substring(0, position);
  const fenceMatches = textBefore.match(/^```/gm);
  const fenceCount = fenceMatches ? fenceMatches.length : 0;
  return fenceCount % 2 === 1;
}

/**
 * Checks if a position in the source is inside inline code (backticks).
 */
function isInsideInlineCode(text: string, position: number): boolean {
  // Quick check: if there's a backtick immediately before position (like `<!-- markco-comments)
  // then we're inside inline code
  if (position > 0 && text[position - 1] === '`') {
    // Make sure it's not a code fence (```)
    if (!(position >= 3 && text.substring(position - 3, position) === '```')) {
      return true;
    }
  }
  
  const textBefore = text.substring(0, position);
  const lastBacktickIndex = textBefore.lastIndexOf('`');
  
  if (lastBacktickIndex === -1) {
    return false;
  }
  
  // Make sure it's not part of a code fence
  const isCodeFenceBacktick = textBefore.substring(lastBacktickIndex).startsWith('```');
  if (isCodeFenceBacktick) {
    return false;
  }
  
  // Check if we're on the same line and there's a closing backtick
  const lineStart = textBefore.lastIndexOf('\n', lastBacktickIndex) + 1;
  const lineEnd = text.indexOf('\n', position);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const positionInLine = position - lineStart;
  
  // Count single backticks (not triple) before and after position in this line
  const beforeInLine = line.substring(0, positionInLine);
  const afterInLine = line.substring(positionInLine);
  const backticksBeforeInLine = (beforeInLine.match(/(?<!`)`(?!`)/g) || []).length;
  const backticksAfterInLine = (afterInLine.match(/(?<!`)`(?!`)/g) || []).length;
  
  // If odd number of single backticks before position in line and at least one after, we're inside inline code
  return backticksBeforeInLine % 2 === 1 && backticksAfterInLine > 0;
}

/**
 * Parses the markco-comments JSON block from markdown source.
 * Searches backwards to find the last valid (non-code-context) comment block.
 */
function parseCommentsFromSource(src: string): Comment[] {
  let searchStart = src.length;
  
  while (searchStart > 0) {
    const blockStart = src.lastIndexOf(COMMENT_BLOCK_START, searchStart - 1);
    if (blockStart === -1) {
      return [];
    }

    // Check if inside code fence or inline code
    if (isInsideCodeFence(src, blockStart) || isInsideInlineCode(src, blockStart)) {
      searchStart = blockStart;
      continue;
    }

    const blockEnd = src.indexOf(COMMENT_BLOCK_END, blockStart + COMMENT_BLOCK_START.length);
    if (blockEnd === -1) {
      searchStart = blockStart;
      continue;
    }

    const jsonStart = blockStart + COMMENT_BLOCK_START.length;
    const jsonText = src.substring(jsonStart, blockEnd).trim();

    // Validate that the content looks like JSON before parsing
    if (!jsonText.startsWith('{')) {
      searchStart = blockStart;
      continue;
    }

    try {
      const data: CommentData = JSON.parse(jsonText);
      if (!data.comments || !Array.isArray(data.comments)) {
        return [];
      }

      // Restore sanitized text and filter out orphaned comments
      return data.comments
        .filter(c => !c.orphaned)
        .map(comment => ({
          ...comment,
          anchor: {
            ...comment.anchor,
            text: restoreFromStorage(comment.anchor.text)
          },
          content: restoreFromStorage(comment.content)
        }));
    } catch {
      // Invalid JSON, try searching before this position
      searchStart = blockStart;
      continue;
    }
  }
  
  return [];
}

/**
 * Groups comments by their start line for efficient lookup.
 */
function groupCommentsByLine(comments: Comment[]): Map<number, Comment[]> {
  const lineMap = new Map<number, Comment[]>();
  
  for (const comment of comments) {
    const line = comment.anchor.startLine;
    const existing = lineMap.get(line) || [];
    existing.push(comment);
    lineMap.set(line, existing);
  }
  
  // Sort comments on each line by startChar for consistent ordering
  for (const [line, lineComments] of lineMap) {
    lineComments.sort((a, b) => a.anchor.startChar - b.anchor.startChar);
  }
  
  return lineMap;
}

/**
 * Extracts all plain text content from inline token children,
 * building a map of character positions to token indices.
 */
function extractTextWithPositions(children: Token[]): { 
  fullText: string; 
  positionMap: Array<{ tokenIndex: number; charStart: number; charEnd: number }> 
} {
  let fullText = '';
  const positionMap: Array<{ tokenIndex: number; charStart: number; charEnd: number }> = [];
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'text' || child.type === 'code_inline') {
      const charStart = fullText.length;
      fullText += child.content;
      positionMap.push({
        tokenIndex: i,
        charStart,
        charEnd: fullText.length
      });
    }
  }
  
  return { fullText, positionMap };
}

/**
 * Helper to escape HTML for use in attributes
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Processes fence (code block) tokens to wrap anchor text in highlight spans.
 * Fence tokens have content directly in token.content rather than children.
 */
function processFenceTokens(
  tokens: Token[],
  lineComments: Map<number, Comment[]>,
  TokenCtor: TokenConstructor
): void {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Only process fence tokens with line mapping
    if (!token.map || token.type !== 'fence') {
      continue;
    }

    const [startLine, endLine] = token.map;
    console.log('Markco: Processing fence token lines', startLine, '-', endLine);
    
    // Collect all comments that fall within this token's line range
    const relevantComments: Comment[] = [];
    for (let line = startLine; line < endLine; line++) {
      const comments = lineComments.get(line);
      if (comments) {
        relevantComments.push(...comments);
      }
    }

    console.log('Markco: Found', relevantComments.length, 'relevant comments for fence token');
    
    if (relevantComments.length === 0) {
      continue;
    }

    // For fence tokens, we need to modify the content and change how it renders
    // We'll convert it to an html_block that includes our highlights
    const content = token.content;
    const info = (token as unknown as { info: string }).info || ''; // language info
    
    // Find all anchor matches and their positions
    const matches: Array<{ start: number; end: number; comment: Comment }> = [];
    
    for (const comment of relevantComments) {
      const anchorText = comment.anchor.text;
      let searchPos = 0;
      let index = content.indexOf(anchorText, searchPos);
      
      if (index !== -1) {
        console.log('Markco: Found fence anchor match at position', index, 'for text:', anchorText.substring(0, 30));
        matches.push({
          start: index,
          end: index + anchorText.length,
          comment
        });
      }
    }
    
    if (matches.length === 0) {
      continue;
    }
    
    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Build new content with highlight spans
    let newContent = '';
    let pos = 0;
    
    for (const match of matches) {
      // Add text before this match (escaped)
      if (match.start > pos) {
        newContent += escapeHtml(content.substring(pos, match.start));
      }
      
      // Add highlighted text
      const resolvedClass = match.comment.resolved ? ' markco-resolved' : '';
      const tooltipText = escapeHtml(match.comment.content);
      const highlightedText = escapeHtml(content.substring(match.start, match.end));
      newContent += `<span class="markco-highlight${resolvedClass}" data-comment-id="${match.comment.id}" title="${tooltipText}">${highlightedText}</span>`;
      
      pos = match.end;
    }
    
    // Add remaining text
    if (pos < content.length) {
      newContent += escapeHtml(content.substring(pos));
    }
    
    // Convert fence token to html_block with pre/code wrapper
    token.type = 'html_block';
    token.tag = '';
    const langClass = info ? ` class="language-${escapeHtml(info)}"` : '';
    token.content = `<pre><code${langClass}>${newContent}</code></pre>\n`;
  }
}

/**
 * Processes inline tokens to wrap anchor text in highlight spans.
 * Handles anchors that span across multiple child tokens (e.g., formatted text).
 */
function processInlineTokens(
  tokens: Token[],
  lineComments: Map<number, Comment[]>,
  TokenCtor: TokenConstructor
): void {
  console.log('Markco: processInlineTokens called with', tokens.length, 'tokens');
  
  for (const token of tokens) {
    // Log all tokens to understand the structure
    if (token.type === 'inline') {
      console.log('Markco: Found inline token, map:', token.map, 'children:', token.children?.length);
    }
    
    // Only process tokens that have line mapping
    if (!token.map || token.type !== 'inline' || !token.children) {
      continue;
    }

    const [startLine, endLine] = token.map;
    console.log('Markco: Processing inline token lines', startLine, '-', endLine);
    
    // Collect all comments that fall within this token's line range
    const relevantComments: Comment[] = [];
    for (let line = startLine; line < endLine; line++) {
      const comments = lineComments.get(line);
      if (comments) {
        relevantComments.push(...comments);
      }
    }

    console.log('Markco: Found', relevantComments.length, 'relevant comments for this token');
    
    if (relevantComments.length === 0) {
      continue;
    }

    // Extract combined text and position mapping
    const { fullText, positionMap } = extractTextWithPositions(token.children);
    console.log('Markco: Combined text length:', fullText.length, 'from', positionMap.length, 'text tokens');
    
    // Find all anchor matches in the combined text
    const matches: Array<{ start: number; end: number; comment: Comment }> = [];
    
    for (const comment of relevantComments) {
      const anchorText = comment.anchor.text;
      // Normalize anchor text to strip markdown syntax that doesn't appear in tokens
      const normalizedAnchor = normalizeAnchorText(anchorText);
      const index = fullText.indexOf(normalizedAnchor);
      
      if (index !== -1) {
        console.log('Markco: Found anchor match at position', index, 'for text:', normalizedAnchor.substring(0, 30));
        matches.push({
          start: index,
          end: index + normalizedAnchor.length,
          comment
        });
      } else {
        // Fallback: highlight entire line content when exact match fails
        console.log('Markco: Using fallback - highlighting entire line for:', anchorText.substring(0, 30));
        matches.push({
          start: 0,
          end: fullText.length,
          comment
        });
      }
    }
    
    if (matches.length === 0) {
      continue;
    }
    
    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Build new children array with highlight spans inserted
    const newChildren: Token[] = [];
    let currentTextPos = 0;
    
    // Helper to add highlight wrapper tokens
    const addHighlightOpen = (comment: Comment) => {
      const openToken = new TokenCtor('html_inline', '', 0);
      const resolvedClass = comment.resolved ? ' markco-resolved' : '';
      const tooltipText = escapeHtml(comment.content);
      openToken.content = `<span class="markco-highlight${resolvedClass}" data-comment-id="${comment.id}" title="${tooltipText}">`;
      newChildren.push(openToken);
    };
    
    const addHighlightClose = () => {
      const closeToken = new TokenCtor('html_inline', '', 0);
      closeToken.content = '</span>';
      newChildren.push(closeToken);
    };
    
    // Track which matches are currently open
    const openMatches: Set<Comment> = new Set();
    
    // Process each child token
    for (let i = 0; i < token.children.length; i++) {
      const child = token.children[i];
      
      // Find position info for this child
      const posInfo = positionMap.find(p => p.tokenIndex === i);
      
      if (!posInfo) {
        // Non-text token (like code_open, code_close, etc.) - pass through
        // But check if we need to wrap it in our highlight
        const isInsideHighlight = matches.some(m => 
          currentTextPos >= m.start && currentTextPos < m.end
        );
        
        if (isInsideHighlight && openMatches.size === 0) {
          // Open highlight before this formatting token
          const match = matches.find(m => currentTextPos >= m.start && currentTextPos < m.end);
          if (match) {
            addHighlightOpen(match.comment);
            openMatches.add(match.comment);
          }
        }
        
        newChildren.push(child);
        continue;
      }
      
      // This is a text/code_inline token - may need to split it
      const tokenStart = posInfo.charStart;
      const tokenEnd = posInfo.charEnd;
      let content = child.content;
      let localPos = 0;
      
      // Check for matches that start, end, or span this token
      const relevantMatches = matches.filter(m => 
        (m.start >= tokenStart && m.start < tokenEnd) || // starts in this token
        (m.end > tokenStart && m.end <= tokenEnd) ||     // ends in this token
        (m.start < tokenStart && m.end > tokenEnd)       // spans this token
      );
      
      if (relevantMatches.length === 0) {
        // No matches affect this token
        // Close any open highlights that should have ended
        for (const comment of openMatches) {
          const match = matches.find(m => m.comment === comment);
          if (match && tokenStart >= match.end) {
            addHighlightClose();
            openMatches.delete(comment);
          }
        }
        newChildren.push(child);
        currentTextPos = tokenEnd;
        continue;
      }
      
      // Need to potentially split this token
      const segments: Array<{ text: string; highlight: Comment | null }> = [];
      let pos = tokenStart;
      
      while (pos < tokenEnd) {
        // Find next match boundary
        let nextBoundary = tokenEnd;
        let boundaryMatch: Comment | null = null;
        let isStart = false;
        
        for (const match of matches) {
          if (match.start > pos && match.start < nextBoundary) {
            nextBoundary = match.start;
            boundaryMatch = match.comment;
            isStart = true;
          }
          if (match.end > pos && match.end < nextBoundary) {
            nextBoundary = match.end;
            boundaryMatch = match.comment;
            isStart = false;
          }
        }
        
        // Add segment up to boundary
        const segmentText = content.substring(pos - tokenStart, nextBoundary - tokenStart);
        const activeMatch = matches.find(m => pos >= m.start && pos < m.end);
        
        if (segmentText) {
          segments.push({
            text: segmentText,
            highlight: activeMatch?.comment || null
          });
        }
        
        pos = nextBoundary;
      }
      
      // Output segments with appropriate wrappers
      for (const segment of segments) {
        if (segment.highlight && !openMatches.has(segment.highlight)) {
          addHighlightOpen(segment.highlight);
          openMatches.add(segment.highlight);
        } else if (!segment.highlight && openMatches.size > 0) {
          // Close all open highlights
          for (const comment of openMatches) {
            addHighlightClose();
          }
          openMatches.clear();
        }
        
        const textToken = new TokenCtor(child.type, child.tag, child.nesting);
        textToken.content = segment.text;
        newChildren.push(textToken);
      }
      
      currentTextPos = tokenEnd;
    }
    
    // Close any remaining open highlights
    for (const comment of openMatches) {
      addHighlightClose();
    }
    
    token.children = newChildren;
    console.log('Markco: Rebuilt children array with', newChildren.length, 'tokens');
  }
}

/**
 * The markdown-it plugin function.
 * Uses a core rule to modify tokens after parsing.
 */
export function markcoPreviewPlugin(md: MarkdownIt): void {
  console.log('Markco: markdown-it plugin loaded');
  
  // Add a core rule that runs after parsing
  md.core.ruler.push('markco_highlight', (state) => {
    console.log('Markco: core rule running, tokens:', state.tokens.length);
    
    // Get the source from state
    const src = state.src;
    
    // Parse comments from source
    const comments = parseCommentsFromSource(src);
    console.log('Markco: found comments:', comments.length);
    
    if (comments.length === 0) {
      return;
    }

    // Group comments by line
    const lineComments = groupCommentsByLine(comments);
    console.log('Markco: grouped by lines:', Array.from(lineComments.keys()));

    // Get Token constructor from state
    const TokenCtor = state.Token as unknown as TokenConstructor;

    // Process fence (code block) tokens
    processFenceTokens(state.tokens, lineComments, TokenCtor);

    // Process inline tokens to wrap anchor text
    processInlineTokens(state.tokens, lineComments, TokenCtor);
  });
}

export default markcoPreviewPlugin;
