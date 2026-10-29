import * as vscode from 'vscode';
import { redact } from './core/redact';

export class Log implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('AgentShift');
  info(message: unknown): void { this.channel.appendLine(redact(message)); }
  error(message: unknown): void { this.channel.appendLine(`ERROR ${redact(message)}`); }
  show(): void { this.channel.show(true); }
  dispose(): void { this.channel.dispose(); }
}
