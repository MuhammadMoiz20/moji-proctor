/**
 * Mock vscode module for testing
 */

export const EventEmitter = class<T> {
  fire(): void {}
  event: any;
};

export const Disposable = {
  from(): any { return {}; }
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2
};

export const ExtensionContext = {};

export const window = {
  createStatusBarItem(): any { return {}; },
  createOutputChannel(): any { return { appendLine(): void {}, show(): void {}, clear(): void {} }; },
  showInformationMessage(): any {},
  showErrorMessage(): any {},
  showWarningMessage(): any {},
  showTextDocument(): any {}
};

export const workspace = {
  onDidChangeTextDocument(): any {},
  onDidOpenTextDocument(): any {},
  onDidCloseTextDocument(): any {},
  createFileSystemWatcher(): any { return { onDidChange(): any {}, onDidCreate(): any {}, onDidDelete(): any {}, dispose(): void {} }; },
  workspaceFolders: []
};

export const commands = {
  registerCommand(): any {},
  executeCommand(): any {}
};

export const extensions = [];

export const env = {
  openExternal(): any {},
  clipboard: {
    writeText(): any {}
  }
};

export const Uri = {
  file(): any { return {}; },
  parse(): any { return {}; }
};
