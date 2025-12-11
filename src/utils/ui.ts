import * as vscode from 'vscode';

export async function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showErrorMessage(message, ...items);
}

export async function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, ...items);
}

export async function showInfoMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, ...items);
}

export async function showInputBox(options: vscode.InputBoxOptions): Promise<string | undefined> {
    return vscode.window.showInputBox(options);
}

export async function showQuickPick(items: string[], options?: vscode.QuickPickOptions): Promise<string | undefined> {
    return vscode.window.showQuickPick(items, options);
}

export async function withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<T>
): Promise<T> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: true
        },
        task
    );
}
