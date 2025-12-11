import * as vscode from 'vscode';

export async function registerInitCommand(context: vscode.ExtensionContext): Promise<void> {
    const command = vscode.commands.registerCommand('spec-kit.init', async () => {
        vscode.window.showInformationMessage('请使用侧边栏聊天界面进行项目初始化');
    });

    context.subscriptions.push(command);
}
