import * as vscode from 'vscode';
// 暂时注释掉有问题的命令导入
// import { registerInitCommand } from './commands/initCommand';
// import { registerSpecifyCommand } from './commands/specifyCommand';
// import { registerPlanCommand } from './commands/planCommand';
// import { registerTasksCommand } from './commands/tasksCommand';
import { EnhancedChatViewProvider } from './ui/EnhancedChatViewProvider';
import { specKitCliService } from './services/specKitCliService';
import { getLogger } from './utils/logger';

const logger = getLogger();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger.info('Spec Kit extension activated');

    try {
        // 1. Register enhanced chat view provider (sidebar) - 这是最重要的
        const chatProvider = new EnhancedChatViewProvider(context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(EnhancedChatViewProvider.viewType, chatProvider)
        );
        logger.info('Chat view provider registered');

        // 2. Register basic commands
        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.checkCli', async () => {
                try {
                    const cliAvailable = await specKitCliService.checkCliAvailable();
                    if (cliAvailable) {
                        const version = await specKitCliService.getCliVersion();
                        vscode.window.showInformationMessage(
                            `✓ specify-cn CLI found\nVersion: ${version}`
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `✗ specify-cn CLI not found. Please install it first.`
                        );
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error checking CLI: ${error}`);
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.init', async () => {
                const { ProjectInitWebView } = await import('./ui/ProjectInitWebView');
                const initWebView = new ProjectInitWebView(context.extensionUri);
                initWebView.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.workflow', async () => {
                const { WorkflowWebView } = await import('./ui/WorkflowWebView');
                const workflowWebView = new WorkflowWebView(context.extensionUri);
                workflowWebView.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.specify', async () => {
                vscode.window.showInformationMessage('请使用侧边栏聊天界面生成规范');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.plan', async () => {
                vscode.window.showInformationMessage('请使用侧边栏聊天界面制定计划');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('spec-kit.tasks', async () => {
                vscode.window.showInformationMessage('请使用侧边栏聊天界面分解任务');
            })
        );

        // 3. Check CLI availability (non-blocking)
        specKitCliService.checkCliAvailable().then(available => {
            if (available) {
                specKitCliService.getCliVersion().then(version => {
                    logger.info(`✓ specify-cn CLI found: ${version}`);
                });
            } else {
                logger.warn(`✗ specify-cn CLI not found`);
            }
        }).catch(error => {
            logger.error(`CLI check failed: ${error}`);
        });

        logger.info('Spec Kit extension activated successfully');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to activate extension: ${msg}`);
        // 即使出错也不要阻止扩展加载
        vscode.window.showErrorMessage(`Spec Kit extension activation failed: ${msg}`);
    }
}

export function deactivate(): void {
    logger.info('Spec Kit extension deactivated');
}
