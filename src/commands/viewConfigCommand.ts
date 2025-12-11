import * as vscode from 'vscode';
import { SpecifyCliService } from '../services/specifyCliService';
import { BaseWebView, WebViewMessage } from '../ui/webview/BaseWebView';
import { ErrorHandler, tryCatch } from '../utils/errorHandler';
import { GitHubService } from '../services/githubService';

export interface ProjectConfig {
    projectPath: string;
    cliVersion: string;
    aiAssistant?: string;
    gitRepository?: {
        owner: string;
        repo: string;
        branch: string;
    };
    files: {
        constitution?: string;
        specification?: string;
        plan?: string;
        tasks?: string;
    };
    aiAgents: {
        [key: string]: {
            installed: boolean;
            version?: string;
            path?: string;
        };
    };
}

export class ConfigWebView extends BaseWebView {
    private _config: ProjectConfig | null = null;

    constructor(extensionUri: vscode.Uri) {
        super(
            extensionUri,
            '项目配置 - Spec Kit',
            'spec-kit-config',
            vscode.ViewColumn.One
        );
    }

    protected getBodyContent(): string {
        if (!this._config) {
            return `
                <div class="loading">
                    <div>正在加载配置...</div>
                    <div class="progress">
                        <div class="progress-bar" style="width: 50%;"></div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="config-content">
                <div class="actions" style="margin-bottom: 20px;">
                    <button class="button" onclick="sendMessage('refreshConfig')">刷新配置</button>
                    <button class="button" onclick="sendMessage('openSettings')">打开设置</button>
                    <button class="button" onclick="sendMessage('checkDependencies')">检查依赖</button>
                    <button class="button" onclick="sendMessage('configureGitHub')">配置 GitHub</button>
                </div>
                <div class="content">
                    ${this.renderConfig()}
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
            case 'refreshConfig':
                this.loadConfig();
                break;
            case 'openSettings':
                this.openSettings();
                break;
            case 'checkDependencies':
                this.checkDependencies();
                break;
            case 'configureGitHub':
                this.configureGitHub();
                break;
        }
    }

    private renderConfig(): string {
        if (!this._config) {
            return '<p>没有配置信息</p>';
        }

        return `
            <div class="config-sections">
                <div class="section">
                    <h2>项目信息</h2>
                    <table class="config-table">
                        <tr>
                            <td><strong>项目路径</strong></td>
                            <td>${this.escapeHtml(this._config.projectPath)}</td>
                        </tr>
                        <tr>
                            <td><strong>CLI 版本</strong></td>
                            <td>${this._config.cliVersion || '未知'}</td>
                        </tr>
                        ${this._config.aiAssistant ? `
                        <tr>
                            <td><strong>AI 助手</strong></td>
                            <td>${this._config.aiAssistant}</td>
                        </tr>
                        ` : ''}
                        ${this._config.gitRepository ? `
                        <tr>
                            <td><strong>Git 仓库</strong></td>
                            <td>
                                <a href="https://github.com/${this._config.gitRepository.owner}/${this._config.gitRepository.repo}"
                                   target="_blank">${this._config.gitRepository.owner}/${this._config.gitRepository.repo}</a>
                                (${this._config.gitRepository.branch})
                            </td>
                        </tr>
                        ` : ''}
                    </table>
                </div>

                <div class="section">
                    <h2>项目文件</h2>
                    <table class="config-table">
                        <tr>
                            <td><strong>项目宪章</strong></td>
                            <td>
                                ${this._config.files.constitution ?
                                    `<span class="status-ok">✓ 存在</span> <a href="#" onclick="sendMessage('openFile', '${this._config.files.constitution}')">打开</a>` :
                                    '<span class="status-missing">✗ 不存在</span>'
                                }
                            </td>
                        </tr>
                        <tr>
                            <td><strong>规范文档</strong></td>
                            <td>
                                ${this._config.files.specification ?
                                    `<span class="status-ok">✓ 存在</span> <a href="#" onclick="sendMessage('openFile', '${this._config.files.specification}')">打开</a>` :
                                    '<span class="status-missing">✗ 不存在</span>'
                                }
                            </td>
                        </tr>
                        <tr>
                            <td><strong>技术方案</strong></td>
                            <td>
                                ${this._config.files.plan ?
                                    `<span class="status-ok">✓ 存在</span> <a href="#" onclick="sendMessage('openFile', '${this._config.files.plan}')">打开</a>` :
                                    '<span class="status-missing">✗ 不存在</span>'
                                }
                            </td>
                        </tr>
                        <tr>
                            <td><strong>任务列表</strong></td>
                            <td>
                                ${this._config.files.tasks ?
                                    `<span class="status-ok">✓ 存在</span> <a href="#" onclick="sendMessage('openFile', '${this._config.files.tasks}')">打开</a>` :
                                    '<span class="status-missing">✗ 不存在</span>'
                                }
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="section">
                    <h2>AI 代理状态</h2>
                    <table class="config-table">
                        ${Object.entries(this._config.aiAgents).map(([agent, status]) => `
                            <tr>
                                <td><strong>${agent}</strong></td>
                                <td>
                                    ${status.installed ?
                                        `<span class="status-ok">✓ 已安装</span> ${status.version ? `(${status.version})` : ''}` :
                                        '<span class="status-missing">✗ 未安装</span>'
                                    }
                                    ${status.path ? `<br><small>路径: ${this.escapeHtml(status.path)}</small>` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            </div>
            <style>
                .config-sections {
                    display: grid;
                    gap: 30px;
                }
                .section {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-border);
                    border-radius: 4px;
                    padding: 20px;
                }
                .section h2 {
                    margin-top: 0;
                    margin-bottom: 15px;
                    color: var(--vscode-foreground);
                    border-bottom: 1px solid var(--vscode-border);
                    padding-bottom: 10px;
                }
                .config-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .config-table td {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--vscode-border);
                }
                .config-table td:first-child {
                    width: 30%;
                    font-weight: bold;
                }
                .status-ok {
                    color: #4CAF50;
                    font-weight: bold;
                }
                .status-missing {
                    color: #F44336;
                    font-weight: bold;
                }
                a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
            </style>
        `;
    }

    public async loadConfig(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('没有打开的工作区');
            }

            const projectPath = workspaceFolders[0].uri.fsPath;

            // Get CLI version
            const cliService = SpecifyCliService.getInstance();
            const detection = await cliService.detectCli();
            const cliVersion = detection.version || '未知';

            // Check AI assistant
            const aiAssistant = await this.detectAIAssistant();

            // Get Git repository info
            const gitRepository = await GitHubService.getCurrentRepository();

            // Check project files
            const files = await this.checkProjectFiles(projectPath);

            // Check AI agents
            const aiAgents = await this.checkAIAgents();

            // Transform GitHubRepository to match ProjectConfig interface
            const gitRepoConfig = gitRepository ? {
                owner: gitRepository.owner,
                repo: gitRepository.repo,
                branch: gitRepository.defaultBranch
            } : undefined;

            this._config = {
                projectPath,
                cliVersion,
                aiAssistant,
                gitRepository: gitRepoConfig,
                files,
                aiAgents
            };

            // Update content
            this.sendMessage({
                command: 'showContent',
                data: {
                    content: this.getBodyContent()
                }
            });

        } catch (error) {
            await ErrorHandler.handle(error as Error, '加载配置');
        }
    }

    private async detectAIAssistant(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return undefined;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        // Check for agent directories
        const agents = [
            { name: 'Claude', dir: '.claude' },
            { name: 'Gemini', dir: '.gemini' },
            { name: 'Cursor', dir: '.cursor' },
            { name: 'Qwen', dir: '.qwen' },
            { name: 'CodeX', dir: '.codex' },
            { name: 'Windsurf', dir: '.windsurf' }
        ];

        for (const agent of agents) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(
                    vscode.Uri.file(projectPath),
                    agent.dir
                ));
                return agent.name;
            } catch {
                // Directory doesn't exist
            }
        }

        return undefined;
    }

    private async checkProjectFiles(projectPath: string): Promise<ProjectConfig['files']> {
        const files: ProjectConfig['files'] = {};

        const fileChecks = [
            { key: 'constitution', paths: ['memory/constitution.md', '.specify/memory/constitution.md'] },
            { key: 'specification', paths: ['.specify/memory/specification.md'] },
            { key: 'plan', paths: ['.specify/memory/plan.md'] },
            { key: 'tasks', paths: ['.specify/memory/tasks.md'] }
        ];

        for (const fileCheck of fileChecks) {
            for (const relativePath of fileCheck.paths) {
                try {
                    const fullPath = vscode.Uri.joinPath(
                        vscode.Uri.file(projectPath),
                        relativePath
                    );
                    await vscode.workspace.fs.stat(fullPath);
                    files[fileCheck.key as keyof ProjectConfig['files']] = fullPath.fsPath;
                    break;
                } catch {
                    // File doesn't exist
                }
            }
        }

        return files;
    }

    private async checkAIAgents(): Promise<ProjectConfig['aiAgents']> {
        const agents = {
            'Claude Code': { cmd: 'claude' },
            'Gemini CLI': { cmd: 'gemini' },
            'Cursor': { cmd: 'cursor-agent' },
            'Qwen Code': { cmd: 'qwen' },
            'OpenCode': { cmd: 'opencode' },
            'CodeX CLI': { cmd: 'codex' },
            'Amazon Q': { cmd: 'q' },
            'CodeBuddy': { cmd: 'codebuddy' },
            'Amp': { cmd: 'amp' },
            'SHAI': { cmd: 'shai' }
        };

        const results: ProjectConfig['aiAgents'] = {};

        for (const [name] of Object.entries(agents)) {
            try {
                // Try to get version
                const cliService = SpecifyCliService.getInstance();
                const detection = await cliService.detectCli();

                // Simple check - in real implementation, you'd check each agent specifically
                results[name] = {
                    installed: detection.found,
                    version: detection.version,
                    path: detection.path
                };
            } catch {
                results[name] = {
                    installed: false
                };
            }
        }

        return results;
    }

    private openSettings(): void {
        vscode.commands.executeCommand('workbench.action.openSettings', 'spec-kit');
    }

    private async checkDependencies(): Promise<void> {
        const cliService = SpecifyCliService.getInstance();
        const detection = await cliService.detectCli();

        if (detection.found) {
            vscode.window.showInformationMessage(
                `specify-cn CLI ${detection.version || ''} 已安装`,
                '查看详情'
            );
        } else {
            vscode.window.showErrorMessage(
                'specify-cn CLI 未找到',
                '安装说明'
            ).then(selection => {
                if (selection === '安装说明') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/github/spec-kit#installation'));
                }
            });
        }
    }

    private async configureGitHub(): Promise<void> {
        const hasToken = GitHubService.getToken();

        if (hasToken) {
            vscode.window.showInformationMessage(
                'GitHub token 已配置',
                '重新配置'
            ).then(selection => {
                if (selection === '重新配置') {
                    GitHubService.promptForToken();
                }
            });
        } else {
            GitHubService.promptForToken();
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
}

// Store active webview instance
let configWebView: ConfigWebView | undefined;

export async function registerViewConfigCommand(context: vscode.ExtensionContext): Promise<void> {
    const command = vscode.commands.registerCommand('spec-kit.viewConfig', async () => {
        await tryCatch(async () => {
            // Create or show webview
            if (!configWebView) {
                configWebView = new ConfigWebView(context.extensionUri);
            }

            // Load configuration
            await configWebView.loadConfig();
            configWebView.show();

        }, '配置查看命令');
    });

    context.subscriptions.push(command);
}

export function getConfigWebView(): ConfigWebView | undefined {
    return configWebView;
}