import { describe, expect, test } from 'bun:test';
import { ProcessTerminal, TUI } from '@mariozechner/pi-tui';
import { editorTheme } from '../theme.js';
import { CustomEditor } from './custom-editor.js';

describe('slash command suggestions', () => {
  test('Tab completes the command without selecting or submitting it', () => {
    const editor = new CustomEditor(new TUI(new ProcessTerminal()), editorTheme);
    let selected = false;
    let submitted = false;
    editor.onSlashSelect = () => { selected = true; };
    editor.onSubmit = () => { submitted = true; };
    editor.onSlashComplete = () => editor.setText('/compact ');
    editor.setText('/comp');
    editor.slashActive = true;

    editor.handleInput('\t');

    expect(editor.getText()).toBe('/compact ');
    expect(editor.slashActive).toBe(false);
    expect(selected).toBe(false);
    expect(submitted).toBe(false);
  });

  test('Enter still selects the highlighted suggestion', () => {
    const editor = new CustomEditor(new TUI(new ProcessTerminal()), editorTheme);
    let selected = false;
    let completed = false;
    editor.onSlashSelect = () => { selected = true; };
    editor.onSlashComplete = () => { completed = true; };
    editor.slashActive = true;

    editor.handleInput('\r');

    expect(selected).toBe(true);
    expect(completed).toBe(false);
  });
});
