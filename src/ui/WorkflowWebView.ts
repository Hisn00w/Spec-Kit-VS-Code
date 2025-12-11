import * as vscode from 'vscode';
import { specKitCliService } from '../services/specKitCliService';
import { aiAgentService } from '../services/aiAgentService';
import { getLogger } from '../utils/logger';

const logger = getLogger();

interface WorkflowStep {
    id: string;
    title: string;
    description: string;
    command: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    required: boolean;
    category: 'core' | 'optional';
}

export class WorkflowWebView {
    private panel: vscode.WebviewPanel | undefined;
    private extensionUri: vscode.Uri;
    private steps: WorkflowStep[] = [
        {
            id: 'constitution',
            title: '建立项目原则',
            description: '创建项目指导原则和开发指南',
            command: '/speckit.constitution',
            status: 'pending',
            required: true,
            category: 'core'
        },
        {
            id: 'specify',
            title: '创建基线规范',
            description: '定义你想要构建的内容(需求和用户故事)',
            command: '/speckit.specify',
            status: 'pending',
            required: true,
            category: 'core'
        },
        {
            id: 'clarify',
            title: '澄清规范细节',
            description: '在规划前询问结构化问题以降低模糊区域的风险',
            command: '/speckit.clarify',
            status: 'pending',
            required: false,
            category: 'optional'
        },
        {
            id: 'plan',
            title: '创建实施计划',
            description: '使用你选择的技术栈创建技术实施计划',
            command: '/speckit.plan',
            status: 'pending',
            required: true,
            category: 'core'
        },
        {
            id: 'checklist',
            title: '生成质量检查清单',
            description: '验证需求的完整性、清晰度和一致性',
            command: '/speckit.checklist',
            status: 'pending',
            required: false,
            category: 'optional'
        },
        {
            id: 'tasks',
            title: '生成可执行任务',
            description: '为实施生成可操作的任务列表',
            command: '/speckit.tasks',
            status: 'pending',
            required: true,
            category: 'core'
        },
        {
            id: 'analyze',
            title: '一致性分析',
            description: '交叉制品一致性和对齐报告',
            command: '/speckit.analyze',
            status: 'pending',
            required: false,
            category: 'optional'
        },
        {
            id: 'implement',
            title: '执行实施',
            description: '执行所有任务并根据计划构建你的功能',
            command: '/speckit.implement',
            status: 'pending',
            required: true,
            category: 'core'
        }
    ];

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'specKitWorkflow',
            'Spec Kit 工作流',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.webview.html = await this.getWebviewContent();

        // 处理来自 webview 的消息
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'executeStep':
                    await this.executeStep(message.stepId, message.input);
                    break;
                case 'markComplete':
                    await this.markStepComplete(message.stepId);
                    break;
                case 'copyCommand':
                    await this.copyCommand(message.stepId, message.input);
                    break;
                case 'refreshStatus':
                    await this.refreshProjectStatus();
                    break;
                case 'openFile':
                    await this.openFile(message.filePath);
                    break;
            }
        });

        // 面板关闭时清理
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初始化时刷新状态
        await this.refreshProjectStatus();
    }

    private async executeStep(stepId: string, input: string) {
        if (!this.panel) {
            return;
        }

        const step = this.steps.find(s => s.id === stepId);
        if (!step) {
            return;
        }

        try {
            // 生成完整的斜杠命令
            let fullCommand = step.command;
            
            switch (stepId) {
                case 'constitution':
                    if (!input.trim()) {
                        this.updateStepStatus(stepId, 'error', '请输入项目原则描述');
                        vscode.window.showErrorMessage('请输入项目原则描述');
                        return;
                    }
                    fullCommand = `${step.command} ${input}`;
                    break;
                case 'specify':
                    if (!input.trim()) {
                        this.updateStepStatus(stepId, 'error', '请输入功能需求描述');
                        vscode.window.showErrorMessage('请输入功能需求描述');
                        return;
                    }
                    fullCommand = `${step.command} ${input}`;
                    break;
                case 'plan':
                    if (!input.trim()) {
                        this.updateStepStatus(stepId, 'error', '请输入技术栈描述');
                        vscode.window.showErrorMessage('请输入技术栈描述');
                        return;
                    }
                    fullCommand = `${step.command} ${input}`;
                    break;
                // tasks, clarify, checklist, analyze, implement 不需要额外输入
            }

            // 更新状态为运行中
            step.status = 'running';
            this.updateStepStatus(stepId, 'running', `正在启动 AI 代理执行命令...`);
            
            // 直接调用 AI 代理执行命令 - 真正的自动执行
            await aiAgentService.executeInTerminal(fullCommand);
            
            // 更新状态
            this.updateStepStatus(stepId, 'running', `✅ 命令已自动发送到 AI 代理，请查看终端`);
            
            // 显示简短的状态栏消息，不打断用户
            vscode.window.setStatusBarMessage(`✅ ${step.title} - 命令已自动执行`, 5000);

        } catch (error) {
            step.status = 'error';
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.updateStepStatus(stepId, 'error', errorMsg);
            
            logger.error(`Step ${stepId} failed: ${errorMsg}`);
            vscode.window.showErrorMessage(`${step.title}失败: ${errorMsg}`);
        }
    }

    private async markStepComplete(stepId: string) {
        const step = this.steps.find(s => s.id === stepId);
        if (step) {
            step.status = 'completed';
            this.updateStepStatus(stepId, 'completed', '已标记为完成');
            vscode.window.showInformationMessage(`${step.title} 已完成！`);
        }
    }

    private async copyCommand(stepId: string, input: string) {
        const step = this.steps.find(s => s.id === stepId);
        if (!step) {
            return;
        }

        let fullCommand = step.command;
        if (input && input.trim()) {
            fullCommand = `${step.command} ${input}`;
        }

        await vscode.env.clipboard.writeText(fullCommand);
        vscode.window.showInformationMessage(`命令已复制: ${fullCommand.substring(0, 60)}${fullCommand.length > 60 ? '...' : ''}`);
    }

    private async refreshProjectStatus() {
        if (!this.panel) {
            return;
        }

        try {
            const projectStatus = await specKitCliService.getProjectStatus();
            
            // 更新步骤状态
            this.steps.forEach(step => {
                switch (step.id) {
                    case 'constitution':
                        step.status = projectStatus.hasConstitution ? 'completed' : 'pending';
                        break;
                    case 'specify':
                        step.status = projectStatus.hasSpecification ? 'completed' : 'pending';
                        break;
                    case 'plan':
                        step.status = projectStatus.hasPlan ? 'completed' : 'pending';
                        break;
                    case 'tasks':
                        step.status = projectStatus.hasTasks ? 'completed' : 'pending';
                        break;
                }
            });

            // 发送状态更新到 webview
            this.panel.webview.postMessage({
                type: 'statusUpdate',
                projectStatus: projectStatus,
                steps: this.steps
            });

        } catch (error) {
            logger.error(`Failed to refresh project status: ${error}`);
        }
    }

    private updateStepStatus(stepId: string, status: string, message?: string) {
        if (!this.panel) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'stepUpdate',
            stepId: stepId,
            status: status,
            message: message
        });
    }

    private async openFile(filePath: string) {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.window.showTextDocument(uri);
        } catch (error) {
            vscode.window.showErrorMessage(`无法打开文件: ${filePath}`);
        }
    }

    private async getWebviewContent(): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'project';

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spec Kit 工作流</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background-color: var(--vscode-sideBar-background);
        }

        .header h1 {
            font-size: 24px;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }

        .project-info {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 10px;
            margin: 15px 0;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }

        .project-info .label {
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }

        .project-info .value {
            color: var(--vscode-terminal-ansiGreen);
        }

        .workflow-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }

        .workflow-section {
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }

        .core-steps {
            border-left: 4px solid var(--vscode-textLink-foreground);
        }

        .optional-steps {
            border-left: 4px solid var(--vscode-descriptionForeground);
        }

        .step-item {
            margin-bottom: 15px;
            padding: 15px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            transition: all 0.2s;
        }

        .step-item:hover {
            border-color: var(--vscode-focusBorder);
        }

        .step-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .step-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
        }

        .step-status {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .step-status.pending {
            background-color: var(--vscode-descriptionForeground);
        }

        .step-status.running {
            background-color: var(--vscode-progressBar-background);
            animation: pulse 1.5s infinite;
        }

        .step-status.completed {
            background-color: var(--vscode-terminal-ansiGreen);
        }

        .step-status.error {
            background-color: var(--vscode-errorForeground);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .step-number {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
        }

        .step-description {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            margin-bottom: 10px;
        }

        .step-command {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--vscode-textPreformat-foreground);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 3px;
            margin-bottom: 10px;
        }

        .step-input {
            width: 100%;
            padding: 10px;
            border: 2px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: 13px;
            margin-bottom: 10px;
            resize: vertical;
            min-height: 80px;
        }

        .step-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
        }

        .step-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
            font-style: italic;
        }

        .input-label {
            display: block;
            margin-bottom: 5px;
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }

        .step-actions {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .step-output {
            margin-top: 10px;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
        }

        .step-output.success {
            background-color: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
        }

        .step-output.error {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin: 20px 0;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background-color: var(--vscode-button-background);
            transition: width 0.3s ease;
        }

        .status-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background-color: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            padding: 8px 20px;
            font-size: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .status-left {
            display: flex;
            gap: 20px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .refresh-btn {
            background: none;
            border: none;
            color: var(--vscode-statusBar-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
        }

        .refresh-btn:hover {
            background-color: var(--vscode-statusBarItem-hoverBackground);
        }

        .file-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
            font-size: 11px;
        }

        .file-link:hover {
            color: var(--vscode-textLink-activeForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌱 Spec Kit 规范驱动开发工作流</h1>
            <p>按步骤完成规范驱动开发流程</p>
            <div class="project-info">
                <div class="label">项目:</div>
                <div class="value">${workspaceName}</div>
                <div class="label">工作路径:</div>
                <div class="value">${workspaceRoot}</div>
            </div>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
        </div>

        <div class="workflow-container">
            <div class="workflow-section core-steps">
                <div class="section-title">🔥 核心步骤 (必需)</div>
                <div id="coreSteps"></div>
            </div>

            <div class="workflow-section optional-steps">
                <div class="section-title">💡 增强步骤 (可选)</div>
                <div id="optionalSteps"></div>
            </div>
        </div>
    </div>

    <div class="status-bar">
        <div class="status-left">
            <div class="status-item">
                <span>Spec Kit CN - 规范驱动开发</span>
            </div>
            <div class="status-item">
                <span id="statusText">准备就绪</span>
            </div>
        </div>
        <div>
            <button class="refresh-btn" onclick="refreshStatus()">🔄 刷新状态</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let steps = [];
        let projectStatus = {};

        function executeStep(stepId) {
            const inputElement = document.getElementById(\`input-\${stepId}\`);
            const input = inputElement ? inputElement.value.trim() : '';
            
            if (!input && isInputRequired(stepId)) {
                // 高亮输入框并显示错误提示
                if (inputElement) {
                    inputElement.style.borderColor = 'var(--vscode-errorForeground)';
                    inputElement.focus();
                    inputElement.placeholder = '⚠️ 请输入内容后再执行！' + getInputPlaceholder(stepId);
                    
                    // 3秒后恢复原样
                    setTimeout(() => {
                        inputElement.style.borderColor = '';
                        inputElement.placeholder = getInputPlaceholder(stepId);
                    }, 3000);
                }
                
                // 显示错误提示
                const outputElement = document.getElementById(\`output-\${stepId}\`);
                if (outputElement) {
                    outputElement.innerHTML = \`
                        <div class="step-output error">
                            ⚠️ 请在上方输入框中输入内容后再点击执行
                        </div>
                    \`;
                }
                return;
            }

            vscode.postMessage({
                type: 'executeStep',
                stepId: stepId,
                input: input
            });
        }

        function isInputRequired(stepId) {
            return ['constitution', 'specify', 'plan'].includes(stepId);
        }

        function refreshStatus() {
            vscode.postMessage({
                type: 'refreshStatus'
            });
        }

        function openFile(filePath) {
            vscode.postMessage({
                type: 'openFile',
                filePath: filePath
            });
        }

        function renderSteps() {
            const coreSteps = steps.filter(step => step.category === 'core');
            const optionalSteps = steps.filter(step => step.category === 'optional');

            renderStepGroup('coreSteps', coreSteps);
            renderStepGroup('optionalSteps', optionalSteps);
            updateProgress();
        }

        function renderStepGroup(containerId, stepList) {
            const container = document.getElementById(containerId);
            container.innerHTML = stepList.map((step, index) => \`
                <div class="step-item" id="step-\${step.id}">
                    <div class="step-header">
                        <div class="step-title">
                            <div class="step-number">\${index + 1}</div>
                            <div class="step-status \${step.status}"></div>
                            <span>\${step.title}</span>
                        </div>
                    </div>
                    <div class="step-description">\${step.description}</div>
                    <div class="step-command">\${step.command}</div>
                    \${renderStepInput(step)}
                    <div class="step-actions">
                        <button class="btn btn-primary" onclick="executeStep('\${step.id}')" 
                                \${step.status === 'running' ? 'disabled' : ''}>
                            \${step.status === 'running' ? '执行中...' : '执行'}
                        </button>
                        \${step.status === 'completed' ? renderFileLinks(step.id) : ''}
                    </div>
                    <div id="output-\${step.id}"></div>
                </div>
            \`).join('');
        }

        function renderStepInput(step) {
            if (['constitution', 'specify', 'plan'].includes(step.id)) {
                const placeholder = getInputPlaceholder(step.id);
                const label = getInputLabel(step.id);
                return \`
                    <label class="input-label" for="input-\${step.id}">\${label}</label>
                    <textarea class="step-input" id="input-\${step.id}" 
                              placeholder="\${placeholder}" rows="3"></textarea>
                \`;
            }
            return '';
        }

        function getInputLabel(stepId) {
            switch (stepId) {
                case 'constitution':
                    return '📝 请输入项目原则描述:';
                case 'specify':
                    return '📝 请输入功能需求描述:';
                case 'plan':
                    return '📝 请输入技术栈描述:';
                default:
                    return '📝 请输入:';
            }
        }

        function getInputPlaceholder(stepId) {
            switch (stepId) {
                case 'constitution':
                    return '描述项目原则，例如：创建专注于代码质量、测试标准、用户体验一致性和性能要求的原则';
                case 'specify':
                    return '描述要构建的功能，例如：构建一个任务管理应用，用户可以创建项目、分配任务、跟踪进度';
                case 'plan':
                    return '描述技术栈，例如：使用 React + TypeScript 前端，Node.js + Express 后端，PostgreSQL 数据库';
                default:
                    return '';
            }
        }

        function renderFileLinks(stepId) {
            const files = getStepFiles(stepId);
            return files.map(file => 
                \`<span class="file-link" onclick="openFile('\${file.path}')">\${file.name}</span>\`
            ).join(' | ');
        }

        function getStepFiles(stepId) {
            const basePath = '${workspaceRoot}/.specify';
            switch (stepId) {
                case 'constitution':
                    return [{ name: 'constitution.md', path: \`\${basePath}/memory/constitution.md\` }];
                case 'specify':
                    return [{ name: 'spec.md', path: \`\${basePath}/specs/001-*/spec.md\` }];
                case 'plan':
                    return [{ name: 'plan.md', path: \`\${basePath}/specs/001-*/plan.md\` }];
                case 'tasks':
                    return [{ name: 'tasks.md', path: \`\${basePath}/specs/001-*/tasks.md\` }];
                default:
                    return [];
            }
        }

        function updateProgress() {
            const completedSteps = steps.filter(step => step.status === 'completed').length;
            const totalSteps = steps.length;
            const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
            
            document.getElementById('progressFill').style.width = \`\${progress}%\`;
            document.getElementById('statusText').textContent = 
                \`进度: \${completedSteps}/\${totalSteps} 步骤完成\`;
        }

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'statusUpdate':
                    steps = message.steps;
                    projectStatus = message.projectStatus;
                    renderSteps();
                    break;
                case 'stepUpdate':
                    updateStepStatus(message.stepId, message.status, message.message);
                    break;
            }
        });

        function updateStepStatus(stepId, status, message) {
            const step = steps.find(s => s.id === stepId);
            if (step) {
                step.status = status;
                
                // 更新状态指示器
                const statusElement = document.querySelector(\`#step-\${stepId} .step-status\`);
                if (statusElement) {
                    statusElement.className = \`step-status \${status}\`;
                }
                
                // 更新按钮
                const button = document.querySelector(\`#step-\${stepId} button\`);
                if (button) {
                    button.disabled = status === 'running';
                    button.textContent = status === 'running' ? '执行中...' : '执行';
                }
                
                // 显示输出消息
                if (message) {
                    const outputElement = document.getElementById(\`output-\${stepId}\`);
                    if (outputElement) {
                        outputElement.innerHTML = \`
                            <div class="step-output \${status === 'error' ? 'error' : 'success'}">
                                \${message}
                            </div>
                        \`;
                    }
                }
                
                updateProgress();
            }
        }

        // 初始化
        refreshStatus();
    </script>
</body>
</html>`;
    }
}