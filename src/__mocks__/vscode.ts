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
  showInformationMessage(): any {},
  showErrorMessage(): any {},
  showWarningMessage(): any {}
};

export const workspace = {
  onDidChangeTextDocument(): any {},
  onDidOpenTextDocument(): any {},
  onDidCloseTextDocument(): any {},
  workspaceFolders: []
};

export const commands = {
  registerCommand(): any {},
  executeCommand(): any {}
};

export const extensions = [];

export const Uri = {
  file(): any { return {}; },
  parse(): any { return {}; }
};
