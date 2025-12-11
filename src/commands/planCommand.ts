import * as vscode from 'vscode';
import { SpecifyCliService } from '../services/specifyCliService';
import { BaseWebView, WebViewMessage } from '../ui/webview/BaseWebView';
import { ErrorHandler, tryCatch } from '../utils/errorHandler';

export class PlanWebView extends BaseWebView {
    private _planContent: string = '';
    private _isLoading: boolean = false;

    constructor(extensionUri: vscode.Uri) {
        super(
            extensionUri,
            '计划生成 - Spec Kit',
            'spec-kit-plan',
            vscode.ViewColumn.One
        );
    }

    protected getBodyContent(): string {
        if (this._isLoading) {
            return `
                <div class="loading">
                    <div>正在生成技术方案...</div>
                    <div class="progress">
                        <div class="progress-bar" style="width: 50%;"></div>
                    </div>
                </div>
            `;
        }

        if (!this._planContent) {
            return `
                <div class="loading">
                    <p>请选择一个规范文件开始生成技术方案</p>
                    <button class="button" onclick="sendMessage('selectSpecification')">选择规范文件</button>
                </div>
            `;
        }

        return `
            <div class="plan-content">
                <div class="actions" style="margin-bottom: 20px;">
                    <button class="button" onclick="sendMessage('editPlan')">编辑计划</button>
                    <button class="button" onclick="sendMessage('savePlan')">保存计划</button>
                    <button class="button" onclick="sendMessage('exportPlan')">导出 Markdown</button>
                    <button class="button" onclick="sendMessage('regeneratePlan')">重新生成</button>
                </div>
                <div class="content">
                    <div style="background-color: var(--vscode-editor-background); padding: 15px; border-radius: 4px; overflow: auto;">
                        <pre style="margin: 0; white-space: pre-wrap; font-family: var(--vscode-editor-font-family);">${this.escapeHtml(this._planContent)}</pre>
                    </div>
                </div>
            </div>
        `;
    }

    protected getScriptContent(): string {
        return `
            function handleWebviewMessage(message) {
                console.log('Received message:', message);
                // Messages are handled in the extension
            }
        `;
    }

    protected onMessage(message: WebViewMessage): void {
        switch (message.command) {
            case 'selectSpecification':
                this.selectSpecificationFile();
                break;
            case 'editPlan':
                this.editPlan();
                break;
            case 'savePlan':
                this.savePlan();
                break;
            case 'exportPlan':
                this.exportPlan();
                break;
            case 'regeneratePlan':
                this.regeneratePlan();
                break;
        }
    }

    public async loadPlan(specificationPath: string): Promise<void> {
        this._isLoading = true;
        this.sendMessage({ command: 'showLoading', data: { progress: 10 } });

        try {
            const cliService = SpecifyCliService.getInstance();

            this.sendMessage({ command: 'showLoading', data: { progress: 30 } });

            // Execute plan command with specification path
            const detection = await cliService.detectCli();
            if (!detection.found || !detection.path) {
                throw new Error('specify-cn CLI not found');
            }

            const result = await cliService.executeCommand(
                detection.path,
                ['plan', specificationPath]
            );

            this.sendMessage({ command: 'showLoading', data: { progress: 70 } });

            this._planContent = result;
            this._isLoading = false;

            // Update content
            this.sendMessage({
                command: 'showContent',
                data: {
                    content: this.getBodyContent()
                }
            });

            // Save to file
            await this.savePlanFile(result);

            this.sendMessage({ command: 'showLoading', data: { progress: 100 } });

            // Open the generated file
            await this.openPlanFile();

        } catch (error) {
            this._isLoading = false;
            this.sendMessage({
                command: 'showError',
                data: {
                    message: (error as Error).message
                }
            });
            await ErrorHandler.handle(error as Error, '计划生成');
        }
    }

    private async selectSpecificationFile(): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: '选择规范文件',
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            await this.loadPlan(fileUri[0].fsPath);
        }
    }

    private async editPlan(): Promise<void> {
        if (!this._planContent) {
            vscode.window.showWarningMessage('没有可编辑的计划内容');
            return;
        }

        // Create or open plan file for editing
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('没有打开的工作区');
            return;
        }

        const planPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'plan.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write plan content
            await vscode.workspace.fs.writeFile(
                planPath,
                Buffer.from(this._planContent, 'utf8')
            );

            // Open in editor
            const document = await vscode.workspace.openTextDocument(planPath);
            await vscode.window.showTextDocument(document);

        } catch (error) {
            await ErrorHandler.handle(error as Error, '打开计划编辑器');
        }
    }

    private async savePlanFile(content: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const planPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'plan.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write plan content
            await vscode.workspace.fs.writeFile(
                planPath,
                Buffer.from(content, 'utf8')
            );

        } catch (error) {
            ErrorHandler.warn(`保存计划文件失败: ${error}`);
        }
    }

    private async savePlan(): Promise<void> {
        if (!this._planContent) {
            vscode.window.showWarningMessage('没有可保存的计划内容');
            return;
        }

        await this.savePlanFile(this._planContent);
        vscode.window.showInformationMessage('技术方案已保存');
    }

    private async exportPlan(): Promise<void> {
        if (!this._planContent) {
            vscode.window.showWarningMessage('没有可导出的计划内容');
            return;
        }

        const options: vscode.SaveDialogOptions = {
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            },
            defaultUri: vscode.Uri.file('technical-plan.md')
        };

        const saveUri = await vscode.window.showSaveDialog(options);
        if (saveUri) {
            try {
                await vscode.workspace.fs.writeFile(
                    saveUri,
                    Buffer.from(this._planContent, 'utf8')
                );
                vscode.window.showInformationMessage(`技术方案已导出到: ${saveUri.fsPath}`);
            } catch (error) {
                await ErrorHandler.handle(error as Error, '导出技术方案');
            }
        }
    }

    private async regeneratePlan(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Try to find specification file
        const specPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'specification.md'
        );

        try {
            await vscode.workspace.fs.stat(specPath);
            await this.loadPlan(specPath.fsPath);
        } catch {
            await this.selectSpecificationFile();
        }
    }

    private async openPlanFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const planPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'plan.md'
        );

        try {
            const document = await vscode.workspace.openTextDocument(planPath);

            // Check user preference
            const config = vscode.workspace.getConfiguration('spec-kit');
            const openInNewTab = config.get<boolean>('openResultsInNewTab', true);

            if (openInNewTab) {
                await vscode.window.showTextDocument(
                    document,
                    vscode.ViewColumn.Beside
                );
            } else {
                await vscode.window.showTextDocument(document);
            }

        } catch (error) {
            ErrorHandler.warn(`打开计划文件失败: ${error}`);
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    public setPlanContent(content: string): void {
        this._planContent = content;
        this.sendMessage({
            command: 'showContent',
            data: {
                content: this.getBodyContent()
            }
        });
    }
}

// Store active webview instance
let planWebView: PlanWebView | undefined;

export async function registerPlanCommand(context: vscode.ExtensionContext): Promise<void> {
    const command = vscode.commands.registerCommand('spec-kit.plan', async () => {
        await tryCatch(async () => {
            // Check if CLI is available
            const cliService = SpecifyCliService.getInstance();
            const detection = await cliService.detectCli();
            if (!detection.found) {
                vscode.window.showErrorMessage('specify-cn CLI 未找到');
                return;
            }

            // Check if project is initialized
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('请先打开一个工作区');
                return;
            }

            const specifyPath = vscode.Uri.joinPath(
                workspaceFolders[0].uri,
                '.specify'
            );

            let projectInitialized: boolean;
            try {
                await vscode.workspace.fs.stat(specifyPath);
                projectInitialized = true;
            } catch {
                projectInitialized = false;
            }

            if (!projectInitialized) {
                const result = await vscode.window.showWarningMessage(
                    '当前项目尚未初始化 Spec Kit',
                    '初始化项目',
                    '取消'
                );

                if (result === '初始化项目') {
                    await vscode.commands.executeCommand('spec-kit.init');
                    return;
                } else {
                    return;
                }
            }

            // Create or show webview
            if (!planWebView) {
                planWebView = new PlanWebView(context.extensionUri);
            }

            // Try to find specification file and load plan
            const specPath = vscode.Uri.joinPath(
                workspaceFolders[0].uri,
                '.specify',
                'memory',
                'specification.md'
            );

            try {
                await vscode.workspace.fs.stat(specPath);
                await planWebView.loadPlan(specPath.fsPath);
            } catch {
                // Specification file not found, let user select
                planWebView.show();
            }

            planWebView.show();

        }, '计划生成命令');
    });

    context.subscriptions.push(command);
}

export function getPlanWebView(): PlanWebView | undefined {
    return planWebView;
}
