import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private debugMode: boolean;

    constructor(name: string = 'Spec Kit') {
        this.outputChannel = vscode.window.createOutputChannel(name);
        this.debugMode = vscode.workspace.getConfiguration('spec-kit').get('debug', false);
    }

    public info(message: string): void {
        this.log('INFO', message);
    }

    public warn(message: string): void {
        this.log('WARN', message);
    }

    public error(message: string): void {
        this.log('ERROR', message);
    }

    public debug(message: string): void {
        if (this.debugMode) {
            this.log('DEBUG', message);
        }
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        this.outputChannel.appendLine(logMessage);
    }

    public show(): void {
        this.outputChannel.show();
    }

    public clear(): void {
        this.outputChannel.clear();
    }
}

let logger: Logger | null = null;

export function getLogger(): Logger {
    if (!logger) {
        logger = new Logger('Spec Kit');
    }
    return logger;
}
