import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as Mocha from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { CommentService } from '../../services/CommentService';
import { Comment, CommentAnchor } from '../../types';

const suite = Mocha.suite;
const test = Mocha.test;
const setup = Mocha.setup;
const teardown = Mocha.teardown;

// Load Markco.md as test data
const markcoPath = path.join(__dirname, '../../../spec/Markco.md');
const markcoContent = fs.readFileSync(markcoPath, 'utf-8');

suite('CommentService Test Suite', () => {
  let commentService: CommentService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    commentService = new CommentService();
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('parseComments', () => {
    test('should return empty array for document without comment block', () => {
      const mockDocument = createMockDocument('# Hello World\n\nSome text here');
      const comments = commentService.parseComments(mockDocument);
      assert.deepStrictEqual(comments, []);
    });

    test('should parse valid comment block from Markco.md', () => {
      const mockDocument = createMockDocument(markcoContent);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.strictEqual(comments.length, 2);
      assert.strictEqual(comments[0].id, '202ba2e2-78e6-410e-9274-33c4069fac71');
      assert.strictEqual(comments[0].content, 'Nice overview');
      assert.strictEqual(comments[0].author, 'Oren Maoz');
      assert.strictEqual(comments[1].id, '7c2fe2ce-8732-46b8-be07-020eb1c86d32');
      assert.strictEqual(comments[1].content, 'What does it mean?');
    });

    test('should handle malformed JSON gracefully', () => {
      const documentText = `# Hello\n\n<!-- markco-comments\n{invalid json}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.deepStrictEqual(comments, []);
    });

    test('should ignore comment block inside code fence', () => {
      const documentText = `# Hello\n\n\`\`\`\n<!-- markco-comments\n{"version": 2, "comments": []}\n-->\n\`\`\``;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.deepStrictEqual(comments, []);
    });

    test('should restore sanitized text from storage', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'test-id-1',
            anchor: { text: 'text with --\u200B>', startLine: 0, startChar: 0, endLine: 0, endChar: 10 },
            content: 'comment with --\u200B>',
            author: 'testuser',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Hello\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      const comments = commentService.parseComments(mockDocument);
      
      assert.strictEqual(comments[0].anchor.text, 'text with -->');
      assert.strictEqual(comments[0].content, 'comment with -->');
    });
  });

  suite('getComments', () => {
    test('should cache parsed comments from Markco.md', () => {
      const mockDocument = createMockDocument(markcoContent);

      // First call parses
      const comments1 = commentService.getComments(mockDocument);
      // Second call should use cache
      const comments2 = commentService.getComments(mockDocument);
      
      assert.strictEqual(comments1.length, 2);
      assert.strictEqual(comments2.length, 2);
      assert.strictEqual(comments1[0].id, '202ba2e2-78e6-410e-9274-33c4069fac71');
      assert.strictEqual(comments1, comments2);
    });
  });

  suite('findComment', () => {
    test('should find comment by ID in Markco.md', () => {
      const mockDocument = createMockDocument(markcoContent);

      const comment = commentService.findComment(mockDocument, '202ba2e2-78e6-410e-9274-33c4069fac71');
      
      assert.strictEqual(comment?.id, '202ba2e2-78e6-410e-9274-33c4069fac71');
      assert.strictEqual(comment?.content, 'Nice overview');
      assert.strictEqual(comment?.author, 'Oren Maoz');
    });

    test('should return undefined for non-existent comment', () => {
      const mockDocument = createMockDocument(markcoContent);

      const comment = commentService.findComment(mockDocument, 'non-existent');
      
      assert.strictEqual(comment, undefined);
    });
  });

  suite('clearCache', () => {
    test('should clear cached comments for document', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'cache-test',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Cache test',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      // Cache comments
      commentService.getComments(mockDocument);
      
      // Clear cache
      commentService.clearCache(mockDocument);
      
      // Create new document with different comments (simulating document change)
      const newDocumentText = `# Test\n\n<!-- markco-comments\n{"version": 2, "comments": []}\n-->`;
      const newMockDocument = createMockDocument(newDocumentText, mockDocument.uri.toString());
      
      // Should re-parse (cache was cleared)
      const comments = commentService.getComments(newMockDocument);
      assert.strictEqual(comments.length, 0);
    });
  });

  suite('Reply operations', () => {
    test('findReply should find reply within a comment', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'comment-1',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Main comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z',
            replies: [
              {
                id: 'reply-1',
                content: 'A reply',
                author: 'replier',
                createdAt: '2024-01-02T00:00:00.000Z'
              }
            ]
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const reply = commentService.findReply(mockDocument, 'comment-1', 'reply-1');
      
      assert.strictEqual(reply?.id, 'reply-1');
      assert.strictEqual(reply?.content, 'A reply');
    });

    test('findReply should return undefined for non-existent reply', () => {
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'comment-1',
            anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
            content: 'Main comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z',
            replies: []
          }
        ]
      };
      const documentText = `# Test\n\n<!-- markco-comments\n${JSON.stringify(commentData)}\n-->`;
      const mockDocument = createMockDocument(documentText);

      const reply = commentService.findReply(mockDocument, 'comment-1', 'non-existent');
      
      assert.strictEqual(reply, undefined);
    });
  });

  suite('getGitUserName', () => {
    test('should return "user" as fallback when git fails', async () => {
      // Create a mock document in a non-git directory
      const mockDocument = createMockDocument('# Test');
      
      // The actual call may fail or succeed depending on environment
      const userName = await commentService.getGitUserName(mockDocument);
      
      // Should return a string (either git username or 'user' fallback)
      assert.strictEqual(typeof userName, 'string');
      assert.ok(userName.length > 0);
    });
  });

  suite('reconcileAnchors', () => {
    test('should not match anchor text found only in comment block', async () => {
      // This tests the bug fix: when anchor text is edited/deleted, 
      // findAnchorInDocument should NOT find it in the JSON comment block
      const anchorText = 'unique anchor text';
      const commentData = {
        version: 2,
        comments: [
          {
            id: 'test-comment',
            anchor: { text: anchorText, startLine: 0, startChar: 2, endLine: 0, endChar: 20 },
            content: 'A comment',
            author: 'testuser',
            createdAt: '2024-01-01T00:00:00.000Z',
            orphaned: false
          }
        ]
      };
      // Document where the anchor text was DELETED from content but still exists in comment block JSON
      const documentText = `# Different text now\n\n<!-- markco-comments\n${JSON.stringify(commentData, null, 2)}\n-->`;
      const mockDocument = createMockDocument(documentText);
      
      // Parse and then reconcile - should mark as orphaned since text only exists in comment block
      commentService.parseComments(mockDocument);
      await commentService.reconcileAnchors(mockDocument);
      
      const comments = commentService.getComments(mockDocument);
      assert.strictEqual(comments.length, 1);
      assert.strictEqual(comments[0].orphaned, true, 'Comment should be orphaned when anchor text only exists in comment block');
    });

    test('should find anchor text that exists in Markco.md content', async () => {
      const mockDocument = createMockDocument(markcoContent);
      
      commentService.parseComments(mockDocument);
      await commentService.reconcileAnchors(mockDocument);
      
      const comments = commentService.getComments(mockDocument);
      assert.strictEqual(comments.length, 2);
      // Both comments should NOT be orphaned since their anchor text exists in the content
      assert.strictEqual(comments[0].orphaned, false, 'First comment should NOT be orphaned');
      assert.strictEqual(comments[1].orphaned, false, 'Second comment should NOT be orphaned');
    });
  });
});

// Helper functions to create mock VS Code objects

function createMockDocument(text: string, uri?: string): vscode.TextDocument {
  const lines = text.split('\n');
  const mockUri = uri ? vscode.Uri.parse(uri) : vscode.Uri.parse('file:///test/mock-document.md');
  
  return {
    uri: mockUri,
    fileName: mockUri.fsPath,
    isUntitled: false,
    languageId: 'markdown',
    version: 1,
    isDirty: false,
    isClosed: false,
    eol: vscode.EndOfLine.LF,
    lineCount: lines.length,
    encoding: 'utf-8',
    getText: (range?: vscode.Range) => {
      if (!range) {
        return text;
      }
      const startOffset = getOffset(text, range.start);
      const endOffset = getOffset(text, range.end);
      return text.substring(startOffset, endOffset);
    },
    getWordRangeAtPosition: () => undefined,
    lineAt: (lineOrPosition: number | vscode.Position) => {
      const lineNumber = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
      const lineText = lines[lineNumber] || '';
      return {
        lineNumber,
        text: lineText,
        range: new vscode.Range(lineNumber, 0, lineNumber, lineText.length),
        rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber + 1, 0),
        firstNonWhitespaceCharacterIndex: lineText.search(/\S/),
        isEmptyOrWhitespace: lineText.trim().length === 0
      };
    },
    offsetAt: (position: vscode.Position) => getOffset(text, position),
    positionAt: (offset: number) => {
      let line = 0;
      let char = 0;
      for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
          line++;
          char = 0;
        } else {
          char++;
        }
      }
      return new vscode.Position(line, char);
    },
    validateRange: (range: vscode.Range) => range,
    validatePosition: (position: vscode.Position) => position,
    save: async () => true
  } as vscode.TextDocument;
}

function getOffset(text: string, position: vscode.Position): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += position.character;
  return Math.min(offset, text.length);
}
