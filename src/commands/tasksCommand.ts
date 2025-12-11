import * as vscode from 'vscode';
import { SpecifyCliService } from '../services/specifyCliService';
import { BaseWebView, WebViewMessage } from '../ui/webview/BaseWebView';
import { ErrorHandler, tryCatch } from '../utils/errorHandler';
import { GitHubService, GitHubTask } from '../services/githubService';

export interface TaskItem {
    id: string;
    title: string;
    description: string;
    userStory?: string;
    acceptanceCriteria?: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
    estimatedHours?: number;
    dependencies?: string[];
    status: 'todo' | 'in-progress' | 'done';
    assignee?: string;
    labels?: string[];
}

export class TasksWebView extends BaseWebView {
    private _tasksContent: string = '';
    private _parsedTasks: TaskItem[] = [];
    private _isLoading: boolean = false;

    constructor(extensionUri: vscode.Uri) {
        super(
            extensionUri,
            '任务分解 - Spec Kit',
            'spec-kit-tasks',
            vscode.ViewColumn.One
        );
    }

    protected getBodyContent(): string {
        if (this._isLoading) {
            return `
                <div class="loading">
                    <div>正在分解任务...</div>
                    <div class="progress">
                        <div class="progress-bar" style="width: 50%;"></div>
                    </div>
                </div>
            `;
        }

        if (!this._tasksContent) {
            return `
                <div class="loading">
                    <p>请选择一个计划文件开始分解任务</p>
                    <button class="button" onclick="sendMessage('selectPlan')">选择计划文件</button>
                </div>
            `;
        }

        return `
            <div class="tasks-content">
                <div class="actions" style="margin-bottom: 20px;">
                    <button class="button" onclick="sendMessage('editTasks')">编辑任务</button>
                    <button class="button" onclick="sendMessage('saveTasks')">保存任务</button>
                    <button class="button" onclick="sendMessage('exportTasks')">导出 Markdown</button>
                    <button class="button" onclick="sendMessage('exportToGitHub')">导出到 GitHub</button>
                    <button class="button" onclick="sendMessage('regenerateTasks')">重新生成</button>
                </div>
                <div class="content">
                    <div class="tabs">
                        <button class="tab-button active" onclick="switchTab('raw')">原始内容</button>
                        <button class="tab-button" onclick="switchTab('parsed')">解析的任务</button>
                    </div>
                    <div id="raw-tab" class="tab-content active">
                        <div style="background-color: var(--vscode-editor-background); padding: 15px; border-radius: 4px; overflow: auto;">
                            <pre style="margin: 0; white-space: pre-wrap; font-family: var(--vscode-editor-font-family);">${this.escapeHtml(this._tasksContent)}</pre>
                        </div>
                    </div>
                    <div id="parsed-tab" class="tab-content">
                        ${this.renderParsedTasks()}
                    </div>
                </div>
            </div>
            <style>
                .tabs {
                    display: flex;
                    margin-bottom: 10px;
                }
                .tab-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-radius: 4px 4px 0 0;
                    margin-right: 2px;
                }
                .tab-button.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
                .task-item {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-border);
                    border-radius: 4px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .task-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .task-priority {
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    margin-right: 10px;
                }
                .priority-critical { background-color: #ff6b6b; color: white; }
                .priority-high { background-color: #ffa500; color: white; }
                .priority-medium { background-color: #ffd93d; color: black; }
                .priority-low { background-color: #6bcf7f; color: white; }
            </style>
            <script>
                function switchTab(tabName) {
                    document.querySelectorAll('.tab-content').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    document.querySelectorAll('.tab-button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    document.getElementById(tabName + '-tab').classList.add('active');
                    event.target.classList.add('active');
                }
            </script>
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
            case 'selectPlan':
                this.selectPlanFile();
                break;
            case 'editTasks':
                this.editTasks();
                break;
            case 'saveTasks':
                this.saveTasks();
                break;
            case 'exportTasks':
                this.exportTasks();
                break;
            case 'exportToGitHub':
                this.exportToGitHub();
                break;
            case 'regenerateTasks':
                this.regenerateTasks();
                break;
        }
    }

    private renderParsedTasks(): string {
        if (this._parsedTasks.length === 0) {
            return '<p>没有解析到任务</p>';
        }

        return this._parsedTasks.map(task => `
            <div class="task-item">
                <div class="task-header">
                    <span class="task-priority priority-${task.priority}">${task.priority.toUpperCase()}</span>
                    <h3 style="margin: 0; flex-grow: 1;">${task.title}</h3>
                </div>
                ${task.userStory ? `<p><strong>用户故事:</strong> ${task.userStory}</p>` : ''}
                <p>${task.description}</p>
                ${task.acceptanceCriteria && task.acceptanceCriteria.length > 0 ? `
                    <p><strong>验收标准:</strong></p>
                    <ul>
                        ${task.acceptanceCriteria.map(ac => `<li>${ac}</li>`).join('')}
                    </ul>
                ` : ''}
                ${task.estimatedHours ? `<p><strong>预估工时:</strong> ${task.estimatedHours} 小时</p>` : ''}
                ${task.dependencies && task.dependencies.length > 0 ? `
                    <p><strong>依赖:</strong> ${task.dependencies.join(', ')}</p>
                ` : ''}
            </div>
        `).join('');
    }

    public async loadTasks(planPath: string): Promise<void> {
        this._isLoading = true;
        this.sendMessage({ command: 'showLoading', data: { progress: 10 } });

        try {
            const cliService = SpecifyCliService.getInstance();

            this.sendMessage({ command: 'showLoading', data: { progress: 30 } });

            // Execute tasks command with plan path
            const detection = await cliService.detectCli();
            if (!detection.found || !detection.path) {
                throw new Error('specify-cn CLI not found');
            }

            const result = await cliService.executeCommand(
                detection.path,
                ['tasks', planPath]
            );

            this.sendMessage({ command: 'showLoading', data: { progress: 70 } });

            this._tasksContent = result;
            this._parsedTasks = this.parseTasks(result);
            this._isLoading = false;

            // Update content
            this.sendMessage({
                command: 'showContent',
                data: {
                    content: this.getBodyContent()
                }
            });

            // Save to file
            await this.saveTasksFile(result);

            this.sendMessage({ command: 'showLoading', data: { progress: 100 } });

            // Open the generated file
            await this.openTasksFile();

        } catch (error) {
            this._isLoading = false;
            this.sendMessage({
                command: 'showError',
                data: {
                    message: (error as Error).message
                }
            });
            await ErrorHandler.handle(error as Error, '任务分解');
        }
    }

    private parseTasks(content: string): TaskItem[] {
        const tasks: TaskItem[] = [];
        const lines = content.split('\n');
        let currentTask: Partial<TaskItem> | null = null;
        let taskId = 1;

        for (const line of lines) {
            const trimmed = line.trim();

            // Task title (markdown heading or numbered list)
            if (trimmed.match(/^#+\s+/) || trimmed.match(/^\d+\.\s+/)) {
                if (currentTask) {
                    tasks.push({ ...currentTask } as TaskItem);
                }
                currentTask = {
                    id: `task-${taskId++}`,
                    title: trimmed.replace(/^#+\s+/, '').replace(/^\d+\.\s+/, ''),
                    description: '',
                    acceptanceCriteria: [],
                    priority: 'medium',
                    status: 'todo',
                    labels: ['spec-kit']
                };
            }
            // Priority indicators
            else if (trimmed.toLowerCase().includes('priority:')) {
                const priorityMatch = trimmed.match(/priority:\s*(low|medium|high|critical)/i);
                if (priorityMatch && currentTask) {
                    currentTask.priority = priorityMatch[1].toLowerCase() as TaskItem['priority'];
                }
            }
            // User story
            else if (trimmed.toLowerCase().includes('user story:')) {
                if (currentTask) {
                    currentTask.userStory = trimmed.replace(/user story:\s*/i, '');
                }
            }
            // Acceptance criteria
            else if (trimmed.toLowerCase().includes('acceptance criteria:')) {
                if (currentTask) {
                    currentTask.acceptanceCriteria = [];
                }
            }
            else if (trimmed.startsWith('- ') && currentTask && currentTask.acceptanceCriteria) {
                currentTask.acceptanceCriteria.push(trimmed.substring(2));
            }
            // Description lines
            else if (trimmed && !trimmed.startsWith('#') && currentTask && !trimmed.toLowerCase().includes('priority:') && !trimmed.toLowerCase().includes('user story:')) {
                currentTask.description += (currentTask.description ? ' ' : '') + trimmed;
            }
        }

        if (currentTask) {
            tasks.push({ ...currentTask } as TaskItem);
        }

        return tasks;
    }

    private async selectPlanFile(): Promise<void> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: '选择计划文件',
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            await this.loadTasks(fileUri[0].fsPath);
        }
    }

    private async editTasks(): Promise<void> {
        if (!this._tasksContent) {
            vscode.window.showWarningMessage('没有可编辑的任务内容');
            return;
        }

        // Create or open tasks file for editing
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('没有打开的工作区');
            return;
        }

        const tasksPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'tasks.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write tasks content
            await vscode.workspace.fs.writeFile(
                tasksPath,
                Buffer.from(this._tasksContent, 'utf8')
            );

            // Open in editor
            const document = await vscode.workspace.openTextDocument(tasksPath);
            await vscode.window.showTextDocument(document);

        } catch (error) {
            await ErrorHandler.handle(error as Error, '打开任务编辑器');
        }
    }

    private async saveTasksFile(content: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const tasksPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'tasks.md'
        );

        try {
            // Ensure directory exists
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.joinPath(workspaceFolders[0].uri, '.specify', 'memory')
            );

            // Write tasks content
            await vscode.workspace.fs.writeFile(
                tasksPath,
                Buffer.from(content, 'utf8')
            );

        } catch (error) {
            ErrorHandler.warn(`保存任务文件失败: ${error}`);
        }
    }

    private async saveTasks(): Promise<void> {
        if (!this._tasksContent) {
            vscode.window.showWarningMessage('没有可保存的任务内容');
            return;
        }

        await this.saveTasksFile(this._tasksContent);
        vscode.window.showInformationMessage('任务已保存');
    }

    private async exportTasks(): Promise<void> {
        if (!this._tasksContent) {
            vscode.window.showWarningMessage('没有可导出的任务内容');
            return;
        }

        const options: vscode.SaveDialogOptions = {
            filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
            },
            defaultUri: vscode.Uri.file('tasks.md')
        };

        const saveUri = await vscode.window.showSaveDialog(options);
        if (saveUri) {
            try {
                await vscode.workspace.fs.writeFile(
                    saveUri,
                    Buffer.from(this._tasksContent, 'utf8')
                );
                vscode.window.showInformationMessage(`任务已导出到: ${saveUri.fsPath}`);
            } catch (error) {
                await ErrorHandler.handle(error as Error, '导出任务');
            }
        }
    }

    private async exportToGitHub(): Promise<void> {
        if (this._parsedTasks.length === 0) {
            vscode.window.showWarningMessage('没有可导出的任务');
            return;
        }

        try {
            // Convert to GitHub tasks
            const githubTasks: GitHubTask[] = this._parsedTasks.map(task => ({
                title: task.title,
                description: `${task.description}${task.userStory ? `\n\n**用户故事**: ${task.userStory}` : ''}${task.acceptanceCriteria && task.acceptanceCriteria.length > 0 ? `\n\n**验收标准**:\n${task.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}` : ''}`,
                labels: ['spec-kit', ...(task.labels || [])],
                priority: task.priority,
                estimatedHours: task.estimatedHours,
                dependencies: task.dependencies
            }));

            // Export to GitHub
            const issues = await GitHubService.exportTasksToIssues(githubTasks);

            vscode.window.showInformationMessage(
                `成功创建 ${issues.length} 个 GitHub Issues`,
                '查看 Issues'
            ).then(selection => {
                if (selection === '查看 Issues') {
                    const repo = issues[0]?.html_url?.split('/').slice(3, 5).join('/');
                    if (repo) {
                        vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${repo}/issues`));
                    }
                }
            });

        } catch (error) {
            await ErrorHandler.handle(error as Error, '导出到 GitHub');
        }
    }

    private async regenerateTasks(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Try to find plan file
        const planPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'plan.md'
        );

        try {
            await vscode.workspace.fs.stat(planPath);
            await this.loadTasks(planPath.fsPath);
        } catch {
            await this.selectPlanFile();
        }
    }

    private async openTasksFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const tasksPath = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.specify',
            'memory',
            'tasks.md'
        );

        try {
            const document = await vscode.workspace.openTextDocument(tasksPath);

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
            ErrorHandler.warn(`打开任务文件失败: ${error}`);
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

    public setTasksContent(content: string): void {
        this._tasksContent = content;
        this._parsedTasks = this.parseTasks(content);
        this.sendMessage({
            command: 'showContent',
            data: {
                content: this.getBodyContent()
            }
        });
    }
}

// Store active webview instance
let tasksWebView: TasksWebView | undefined;

export async function registerTasksCommand(context: vscode.ExtensionContext): Promise<void> {
    const command = vscode.commands.registerCommand('spec-kit.tasks', async () => {
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
            if (!tasksWebView) {
                tasksWebView = new TasksWebView(context.extensionUri);
            }

            // Try to find plan file and load tasks
            const planPath = vscode.Uri.joinPath(
                workspaceFolders[0].uri,
                '.specify',
                'memory',
                'plan.md'
            );

            try {
                await vscode.workspace.fs.stat(planPath);
                await tasksWebView.loadTasks(planPath.fsPath);
            } catch {
                // Plan file not found, let user select
                tasksWebView.show();
            }

            tasksWebView.show();

        }, '任务分解命令');
    });

    context.subscriptions.push(command);
}

export function getTasksWebView(): TasksWebView | undefined {
    return tasksWebView;
}
