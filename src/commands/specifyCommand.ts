import * as vscode from 'vscode';
import { SpecifyCliService } from '../services/specifyCliService';
import { BaseWebView, WebViewMessage } from '../ui/webview/BaseWebView';
import { ErrorHandler, tryCatch } from '../utils/errorHandler';

export class SpecificationWebView extends BaseWebView {
    private _specificationContent: string = '';
    private _isLoading: boolean = false;
    private _constitutionPath: string = '';

    constructor(extensionUri: vscode.Uri) {
        super(
            extensionUri,
            '规范文档 - Spec Kit',
            'spec-kit-specification',
            vscode.ViewColumn.One
        );
    }

    protected getBodyContent(): string {
        if (this._isLoading) {
            return `
                <div class="loading">
                    <div>正在生成规范文档...</div>
                    <div class="progress">
                        <div class="progress-bar" style="width: 50%;"></div>
                    </div>
                </div>
            `;
        }

        if (!this._specificationContent) {
            return `
                <div class="loading">
                    <p>请选择一个项目宪章文件开始生成规范文档</p>
                    <button class="button" onclick="sendMessage('selectConstitution')">选择宪章文件</button>
                </div>
            `;
        }

        return `
            <div class="specification-content">
                <div class="actions" style="margin-bottom: 20px;">
                    <button class="button" onclick="sendMessage('editSpecification')">编辑规范</button>
                    <button class="button" onclick="sendMessage('saveSpecification')">保存规范</button>
                    <button class="button" onclick="sendMessage('exportSpecification')">导出 Markdown</button>
                    <button class="button" onclick="sendMessage('regenerateSpecification')">重新生成</button>
                </div>
                <div class="content">
                    <div style="background-color: var(--vscode-editor-background); padding: 15px; border-radius: 4px; overflow: auto;">
                        <pre style="margin: 0; white-space: pre-wrap; font-family: var(--vscode-editor-font-family);">${this.escapeHtml(this._specificationContent)}</pre>
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
            case 'selectConstitution':
                this.selectConstitutionFile();
                break;
            case 'editSpecification':
                this.editSpecification();
                break;
            case 'saveSpecification':
                this.saveSpecification();
                break;
            case 'exportSpecification':
                this.exportSpecification();
                break;
            case 'regenerateSpecification':
                this.regenerateSpecification();
                break;
        }
    }

    public async loadSpecification(constitutionPath: string): Promise<void> {
        this._constitutionPath = constitutionPath;
        this._isLoading = true;
        this.sendMessage({ command: 'showLoading', data: { progress: 10 } });

        try {
            const cliService = SpecifyCliService.getInstance();

            this.sendMessage({ command: 'showLoading', data: { progress: 30 } });

            // Execute specify command with constitution path
            const detection = await cliService.detectCli();
            if (!detection.found || !detection.path) {
                throw new Error('specify-cn CLI not found');
            }

            const result = await cliService.executeCommand(
                detection.path,
                ['specify', constitutionPath]
            );

            this.sendMessage({ command: 'showLoading', data: { progress: 70 } });

            this._specificationContent = result;
            this._isLoading = false;

            // Update content
            this.sendMessage({
                command: 'showContent',
                data: {
                    content: this.getBodyContent()
                }
            });

            // Save to file
            await this.saveSpecificationFile(result);

            this.sendMessage({ command: 'showLoading', data: { progress: 100 } });

            // Open the generated file
            await this.openSpecificationFile();

        } catch (error) {
            this._isLoading = false;
            this.sendMessage({
                command: 'showError',
                data: {
                    message: (error as Error).message
                }
            });
            await ErrorHandler.handle(error as Error, '规范生成');
        }
    }

    private async selectConstitutionFile(): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: '选择项目宪章文件',
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            await this.loadSpecification(fileUri[0].fsPath);
        }
    }

    private async editSpecification(): Promise<void> {
        if (!this._specificationContent) {
            vscode.window.showWarningMessage('没有可编辑的规范内容');
            return;
        }

        // Create or open specification file for editing
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('没有打开的工作区');
            return;
        }

        const specPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'specification.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write specification content
            await vscode.workspace.fs.writeFile(
                specPath,
                Buffer.from(this._specificationContent, 'utf8')
            );

            // Open in editor
            const document = await vscode.workspace.openTextDocument(specPath);
            await vscode.window.showTextDocument(document);

        } catch (error) {
            await ErrorHandler.handle(error as Error, '打开规范编辑器');
        }
    }

    private async saveSpecificationFile(content: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const specPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'specification.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write specification content
            await vscode.workspace.fs.writeFile(
                specPath,
                Buffer.from(content, 'utf8')
            );

        } catch (error) {
            ErrorHandler.warn(`保存规范文件失败: ${error}`);
        }
    }

    private async saveSpecification(): Promise<void> {
        if (!this._specificationContent) {
            vscode.window.showWarningMessage('没有可保存的规范内容');
            return;
        }

        await this.saveSpecificationFile(this._specificationContent);
        vscode.window.showInformationMessage('规范文档已保存');
    }

    private async exportSpecification(): Promise<void> {
        if (!this._specificationContent) {
            vscode.window.showWarningMessage('没有可导出的规范内容');
            return;
        }

        const options: vscode.SaveDialogOptions = {
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            },
            defaultUri: vscode.Uri.file('specification.md')
        };

        const saveUri = await vscode.window.showSaveDialog(options);
        if (saveUri) {
            try {
                await vscode.workspace.fs.writeFile(
                    saveUri,
                    Buffer.from(this._specificationContent, 'utf8')
                );
                vscode.window.showInformationMessage(`规范文档已导出到: ${saveUri.fsPath}`);
            } catch (error) {
                await ErrorHandler.handle(error as Error, '导出规范文档');
            }
        }
    }

    private async regenerateSpecification(): Promise<void> {
        if (this._constitutionPath) {
            await this.loadSpecification(this._constitutionPath);
        } else {
            await this.selectConstitutionFile();
        }
    }

    private async openSpecificationFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const specPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'specification.md'
        );

        try {
            const document = await vscode.workspace.openTextDocument(specPath);

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
            ErrorHandler.warn(`打开规范文件失败: ${error}`);
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

    public setSpecificationContent(content: string): void {
        this._specificationContent = content;
        this.sendMessage({
            command: 'showContent',
            data: {
                content: this.getBodyContent()
            }
        });
    }
}

// Store active webview instance
let specificationWebView: SpecificationWebView | undefined;

export async function registerSpecifyCommand(context: vscode.ExtensionContext): Promise<void> {
    const command = vscode.commands.registerCommand('spec-kit.specify', async () => {
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
            if (!specificationWebView) {
                specificationWebView = new SpecificationWebView(context.extensionUri);
            }

            // Try to find constitution file and load specification
            const constitutionPath = vscode.Uri.joinPath(
                workspaceFolders[0].uri,
                'memory',
                'constitution.md'
            );

            try {
                await vscode.workspace.fs.stat(constitutionPath);
                await specificationWebView.loadSpecification(constitutionPath.fsPath);
            } catch {
                // Constitution file not found, let user select
                specificationWebView.show();
            }

            specificationWebView.show();

        }, '规范生成命令');
    });

    context.subscriptions.push(command);
}

export function getSpecificationWebView(): SpecificationWebView | undefined {
    return specificationWebView;
}
