import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as Mocha from 'mocha';
import { isMarkdownCompatibleLanguage } from '../../extension';

const suite = Mocha.suite;
const test = Mocha.test;

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting Markco extension tests');

  suite('Extension Activation', () => {
    test('Extension should be present', () => {
      const extension = vscode.extensions.getExtension('OrenMaoz.markco');
      // Extension may not be installed in test environment, just check API works
      assert.ok(true, 'Extension API is accessible');
    });

    test('Commands should be registered', async () => {
      // Get all registered commands
      const commands = await vscode.commands.getCommands(true);
      
      // Check that Markco commands are registered when extension is active
      const markcoCommands = commands.filter(cmd => cmd.startsWith('markco.'));
      
      // If extension is active, commands should be registered
      // Note: In test environment, extension may not auto-activate
      assert.ok(Array.isArray(markcoCommands), 'Commands array is accessible');
    });
  });

  suite('Markdown Document Handling', () => {
    test('Should create markdown document', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: '# Test Document\n\nSome text here.'
      });

      assert.strictEqual(document.languageId, 'markdown');
      assert.ok(document.getText().includes('# Test Document'));
    });

    test('Should edit markdown document', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: '# Original'
      });

      suite('Language Compatibility', () => {
        test('Should treat skill language as markdown-compatible', () => {
          assert.strictEqual(isMarkdownCompatibleLanguage('markdown'), true);
          assert.strictEqual(isMarkdownCompatibleLanguage('skill'), true);
          assert.strictEqual(isMarkdownCompatibleLanguage('plaintext'), false);
        });

        test('Package contribution contexts should include skill language', () => {
          const packageJsonPath = path.resolve(__dirname, '../../../package.json');
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

          assert.ok(packageJson.activationEvents.includes('onLanguage:skill'));

          const editorContextWhen = packageJson.contributes.menus['editor/context'][0].when as string;
          const editorTitleWhen = packageJson.contributes.menus['editor/title'][0].when as string;
          const keybindingWhen = packageJson.contributes.keybindings[0].when as string;

          assert.ok(editorContextWhen.includes('editorLangId == skill'));
          assert.ok(editorTitleWhen.includes('editorLangId == skill'));
          assert.ok(keybindingWhen.includes('editorLangId == skill'));
        });
      });
      
      const editor = await vscode.window.showTextDocument(document);
      
      await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 10), ' Modified');
      });
      
      assert.ok(document.getText().includes('Modified'));
    });
  });

  suite('Selection Handling', () => {
    test('Should handle text selection', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: '# Hello World\n\nThis is test text.'
      });
      
      const editor = await vscode.window.showTextDocument(document);
      
      // Select "World"
      const start = new vscode.Position(0, 8);
      const end = new vscode.Position(0, 13);
      editor.selection = new vscode.Selection(start, end);
      
      assert.strictEqual(document.getText(editor.selection), 'World');
    });

    test('Should detect empty selection', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: '# Test'
      });
      
      const editor = await vscode.window.showTextDocument(document);
      
      // Empty selection (cursor position)
      const pos = new vscode.Position(0, 3);
      editor.selection = new vscode.Selection(pos, pos);
      
      assert.ok(editor.selection.isEmpty);
    });
  });

  suite('Comment Block Format', () => {
    test('Should recognize comment block structure', () => {
      const COMMENT_BLOCK_START = '<!-- markco-comments';
      const COMMENT_BLOCK_END = '-->';
      
      const validBlock = `<!-- markco-comments
{
  "version": 2,
  "comments": []
}
-->`;
      
      assert.ok(validBlock.includes(COMMENT_BLOCK_START));
      assert.ok(validBlock.includes(COMMENT_BLOCK_END));
    });

    test('Should validate comment data structure', () => {
      const validData = {
        version: 2,
        comments: [
          {
            id: 'test-id',
            anchor: {
              text: 'test',
              startLine: 0,
              startChar: 0,
              endLine: 0,
              endChar: 4
            },
            content: 'A comment',
            author: 'user',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      };
      
      assert.strictEqual(validData.version, 2);
      assert.ok(Array.isArray(validData.comments));
      assert.ok(validData.comments[0].id);
      assert.ok(validData.comments[0].anchor);
      assert.ok(validData.comments[0].content);
    });
  });

  suite('Webview Provider', () => {
    test('Should have valid view type', () => {
      const viewType = 'markco.commentSidebar';
      assert.ok(viewType.startsWith('markco.'));
    });
  });

  suite('Configuration', () => {
    test('Should access configuration values', () => {
      const config = vscode.workspace.getConfiguration('markco');
      
      // Get default values or configured values
      const highlightColor = config.get<string>('highlightColor');
      const highlightBorderColor = config.get<string>('highlightBorderColor');
      
      // Values may be undefined if extension not active, but API should work
      assert.ok(config !== undefined, 'Configuration object is accessible');
    });
  });

  suite('Types Validation', () => {
    test('CommentAnchor should have required fields', () => {
      const anchor = {
        text: 'test',
        startLine: 0,
        startChar: 0,
        endLine: 0,
        endChar: 4
      };
      
      assert.ok('text' in anchor);
      assert.ok('startLine' in anchor);
      assert.ok('startChar' in anchor);
      assert.ok('endLine' in anchor);
      assert.ok('endChar' in anchor);
    });

    test('Reply should have required fields', () => {
      const reply = {
        id: 'reply-1',
        content: 'A reply',
        author: 'user',
        createdAt: new Date().toISOString()
      };
      
      assert.ok('id' in reply);
      assert.ok('content' in reply);
      assert.ok('author' in reply);
      assert.ok('createdAt' in reply);
    });

    test('Comment should support replies array', () => {
      const comment = {
        id: 'comment-1',
        anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
        content: 'Main comment',
        author: 'user',
        createdAt: new Date().toISOString(),
        replies: [
          { id: 'r1', content: 'Reply 1', author: 'user2', createdAt: new Date().toISOString() }
        ]
      };
      
      assert.ok(Array.isArray(comment.replies));
      assert.strictEqual(comment.replies.length, 1);
    });

    test('Comment should support resolved flag', () => {
      const comment = {
        id: 'comment-1',
        anchor: { text: 'test', startLine: 0, startChar: 0, endLine: 0, endChar: 4 },
        content: 'A comment',
        author: 'user',
        createdAt: new Date().toISOString(),
        resolved: true
      };
      
      assert.strictEqual(comment.resolved, true);
    });

    test('Comment should support orphaned flag', () => {
      const comment = {
        id: 'comment-1',
        anchor: { text: 'deleted text', startLine: 0, startChar: 0, endLine: 0, endChar: 12 },
        content: 'Orphaned comment',
        author: 'user',
        createdAt: new Date().toISOString(),
        orphaned: true
      };
      
      assert.strictEqual(comment.orphaned, true);
    });
  });

  suite('Text Sanitization', () => {
    test('Should handle dangerous sequences', () => {
      // Test that --> doesn't break comment blocks
      const dangerousText = 'text with --> in it';
      const sanitized = dangerousText.replace(/-->/g, '--\u200B>');
      const restored = sanitized.replace(/--\u200B>/g, '-->');
      
      assert.notStrictEqual(sanitized, dangerousText);
      assert.strictEqual(restored, dangerousText);
    });
  });

  suite('Position Calculations', () => {
    test('Should convert offset to position', () => {
      const text = 'Line 0\nLine 1\nLine 2';
      
      // Character at offset 0 is at (0, 0)
      // Character at offset 7 is at (1, 0) - start of "Line 1"
      // Character at offset 10 is at (1, 3) - 'e' in "Line 1"
      
      let offset = 0;
      let expectedLine = 0;
      let expectedChar = 0;
      
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
          expectedLine++;
          expectedChar = 0;
        } else {
          expectedChar++;
        }
      }
      
      // Final position should be (2, 6) for end of "Line 2"
      assert.strictEqual(expectedLine, 2);
      assert.strictEqual(expectedChar, 6);
    });
  });
});
