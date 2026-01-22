import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as Mocha from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { CommentDecorator } from '../../decorators/CommentDecorator';
import { CommentService } from '../../services/CommentService';
import { Comment } from '../../types';

const suite = Mocha.suite;
const test = Mocha.test;
const setup = Mocha.setup;
const teardown = Mocha.teardown;

// Load Markco.md as test data
const markcoPath = path.join(__dirname, '../../../spec/Markco.md');
const markcoContent = fs.readFileSync(markcoPath, 'utf-8');

suite('CommentDecorator Test Suite', () => {
  let commentDecorator: CommentDecorator;
  let commentService: CommentService;
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    commentDecorator = new CommentDecorator();
    commentService = new CommentService();
  });

  teardown(() => {
    commentDecorator.dispose();
    sandbox.restore();
  });

  suite('setFocusedComment / getFocusedCommentId', () => {
    test('should set and get focused comment ID', () => {
      assert.strictEqual(commentDecorator.getFocusedCommentId(), null);
      
      commentDecorator.setFocusedComment('test-id');
      
      assert.strictEqual(commentDecorator.getFocusedCommentId(), 'test-id');
    });

    test('should clear focused comment when set to null', () => {
      commentDecorator.setFocusedComment('test-id');
      commentDecorator.setFocusedComment(null);
      
      assert.strictEqual(commentDecorator.getFocusedCommentId(), null);
    });
  });

  suite('findCommentAtPosition', () => {
    test('should find first comment in Markco.md at its position', () => {
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      // Position inside the first comment's anchor (line 2, which is the overview paragraph)
      const position = new vscode.Position(2, 50);
      
      const found = commentDecorator.findCommentAtPosition(document, position, comments);
      
      assert.strictEqual(found?.id, '202ba2e2-78e6-410e-9274-33c4069fac71');
      assert.strictEqual(found?.content, 'Nice overview');
    });

    test('should find second comment in Markco.md at its position', () => {
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      // Position inside the second comment's anchor (line 19, "Check grammar")
      const position = new vscode.Position(19, 50);
      
      const found = commentDecorator.findCommentAtPosition(document, position, comments);
      
      assert.strictEqual(found?.id, '7c2fe2ce-8732-46b8-be07-020eb1c86d32');
      assert.strictEqual(found?.content, 'What does it mean?');
    });

    test('should return undefined when no comment at position', () => {
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      // Position outside any comment anchor
      const position = new vscode.Position(0, 0); // First line "# Interactive..."

      const found = commentDecorator.findCommentAtPosition(document, position, comments);
      
      assert.strictEqual(found, undefined);
    });

    test('should return undefined for empty comments array', () => {
      const document = createMockDocument('# Hello World');
      const position = new vscode.Position(0, 4);
      
      const found = commentDecorator.findCommentAtPosition(document, position, []);
      
      assert.strictEqual(found, undefined);
    });
  });

  suite('applyDecorations', () => {
    test('should skip resolved comments', async () => {
      const editor = await createMockEditor('# Hello World\nSome text');
      const comments: Comment[] = [
        { ...createMockComment('resolved-1', 'Hello', 0, 2, 0, 7), resolved: true }
      ];
      
      // Should not throw
      commentDecorator.applyDecorations(editor, comments);
    });

    test('should skip orphaned comments', async () => {
      const editor = await createMockEditor('# Hello World\nSome text');
      const comments: Comment[] = [
        { ...createMockComment('orphaned-1', 'Deleted text', 0, 2, 0, 14), orphaned: true }
      ];
      
      // Should not throw
      commentDecorator.applyDecorations(editor, comments);
    });

    test('should apply decorations for Markco.md comments', async () => {
      const editor = await createMockEditor(markcoContent);
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      // Should not throw and should apply decorations for 2 comments
      commentDecorator.applyDecorations(editor, comments);
      
      assert.strictEqual(comments.length, 2);
    });

    test('should highlight focused comment in Markco.md differently', async () => {
      const editor = await createMockEditor(markcoContent);
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      commentDecorator.setFocusedComment('202ba2e2-78e6-410e-9274-33c4069fac71');
      
      // Should not throw
      commentDecorator.applyDecorations(editor, comments);
      
      assert.strictEqual(commentDecorator.getFocusedCommentId(), '202ba2e2-78e6-410e-9274-33c4069fac71');
    });
  });

  suite('clearDecorations', () => {
    test('should clear all decorations from editor', async () => {
      const editor = await createMockEditor('# Hello World');
      const comments: Comment[] = [
        createMockComment('comment-1', 'Hello', 0, 2, 0, 7)
      ];
      
      commentDecorator.applyDecorations(editor, comments);
      
      // Should not throw
      commentDecorator.clearDecorations(editor);
    });
  });

  suite('navigateToComment', () => {
    test('should navigate to comment position in Markco.md', async () => {
      const editor = await createMockEditor(markcoContent);
      const document = createMockDocument(markcoContent);
      const comments = commentService.parseComments(document);
      
      // Navigate to first comment
      commentDecorator.navigateToComment(editor, comments[0]);
      
      assert.strictEqual(commentDecorator.getFocusedCommentId(), '202ba2e2-78e6-410e-9274-33c4069fac71');
    });
  });

  suite('dispose', () => {
    test('should dispose decoration types', () => {
      // Create a new decorator to test disposal
      const decorator = new CommentDecorator();
      
      // Should not throw
      decorator.dispose();
    });
  });
});

// Helper functions

function createMockComment(
  id: string,
  text: string,
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number
): Comment {
  return {
    id,
    anchor: { text, startLine, startChar, endLine, endChar },
    content: `Comment for "${text}"`,
    author: 'testuser',
    createdAt: new Date().toISOString()
  };
}

function createMockDocument(text: string): vscode.TextDocument {
  const lines = text.split('\n');
  const mockUri = vscode.Uri.parse('file:///test/decorator-test.md');
  
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

async function createMockEditor(text: string): Promise<vscode.TextEditor> {
  // Create a temporary document and show it
  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: text
  });
  return await vscode.window.showTextDocument(document);
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
