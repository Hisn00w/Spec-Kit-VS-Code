import * as vscode from 'vscode';
import { specKitCliService } from '../services/specKitCliService';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class ProjectInitWebView {
    private panel: vscode.WebviewPanel | undefined;
    private extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public async show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'specKitInit',
            'Spec Kit 项目初始化',
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
                case 'initProject':
                    await this.handleInitProject(message.data);
                    break;
                case 'checkCli':
                    await this.handleCheckCli();
                    break;
            }
        });

        // 面板关闭时清理
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初始化时检查 CLI 状态
        await this.handleCheckCli();
    }

    private async handleInitProject(data: {
        projectName: string;
        aiAssistant: string;
        scriptType: string;
        useCurrentDir: boolean;
        enableGit: boolean;
        enableDebug: boolean;
    }) {
        if (!this.panel) {
            return;
        }

        try {
            let forceConfirmed = false;

            // 如果在当前目录初始化，检查目录是否为空
            if (data.useCurrentDir) {
                const dirCheck = await specKitCliService.checkDirectoryEmpty();
                if (!dirCheck.isEmpty) {
                    // 目录非空，需要用户确认
                    const confirmAction = await vscode.window.showWarningMessage(
                        `当前目录不为空（${dirCheck.itemCount} 个文件/文件夹）。模板文件将与现有内容合并，可能会覆盖现有文件。`,
                        { modal: true },
                        '继续初始化',
                        '取消'
                    );

                    if (confirmAction !== '继续初始化') {
                        this.panel.webview.postMessage({
                            type: 'initError',
                            message: '初始化已取消',
                            error: `当前目录包含 ${dirCheck.itemCount} 个文件/文件夹`
                        });
                        return;
                    }
                    forceConfirmed = true;
                }
            }

            // 显示进度
            this.panel.webview.postMessage({
                type: 'showProgress',
                message: '正在初始化项目...'
            });

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            
            const result = await specKitCliService.initProject(
                data.useCurrentDir ? undefined : data.projectName,
                {
                    ai: data.aiAssistant,
                    here: data.useCurrentDir,
                    force: forceConfirmed,
                    noGit: !data.enableGit,
                    script: data.scriptType,
                    debug: data.enableDebug
                }
            );

            if (result.success) {
                // 设置 AI 代理为用户选择的代理
                const { aiAgentService } = await import('../services/aiAgentService');
                aiAgentService.setCurrentAgent(data.aiAssistant);
                
                this.panel.webview.postMessage({
                    type: 'initSuccess',
                    message: '项目初始化成功！',
                    output: result.output
                });

                // 显示成功消息
                const action = await vscode.window.showInformationMessage(
                    `项目 "${data.projectName}" 初始化成功！AI 代理已设置为 ${data.aiAssistant}`,
                    '打开文件夹',
                    '关闭'
                );

                if (action === '打开文件夹' && !data.useCurrentDir) {
                    const projectPath = workspaceRoot ? 
                        vscode.Uri.file(`${workspaceRoot}/${data.projectName}`) :
                        vscode.Uri.file(data.projectName);
                    
                    await vscode.commands.executeCommand('vscode.openFolder', projectPath);
                }

                // 关闭初始化面板
                this.panel.dispose();
            } else {
                // 构建简洁的错误信息
                let errorDetail = '';
                
                // 合并 error 和 output，提取关键信息
                const fullOutput = [result.error, result.output].filter(Boolean).join('\n');
                
                // 提取关键错误信息
                const lines = fullOutput.split('\n').filter(line => {
                    const trimmed = line.trim();
                    // 过滤掉空行和纯装饰行
                    if (!trimmed || /^[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\-|+*=]+$/.test(trimmed)) {
                        return false;
                    }
                    return true;
                });
                
                errorDetail = lines.join('\n');
                
                if (!errorDetail.trim()) {
                    errorDetail = '初始化过程中发生错误，请检查 CLI 是否正确安装';
                }
                
                this.panel.webview.postMessage({
                    type: 'initError',
                    message: '项目初始化失败',
                    error: errorDetail
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Project init failed: ${errorMsg}`);
            
            this.panel.webview.postMessage({
                type: 'initError',
                message: '项目初始化失败',
                error: errorMsg || '发生未知错误，请检查 CLI 是否正确安装'
            });
        }
    }

    private async handleCheckCli() {
        if (!this.panel) {
            return;
        }

        try {
            const cliAvailable = await specKitCliService.checkCliAvailable();
            const version = cliAvailable ? await specKitCliService.getCliVersion() : 'Not available';

            this.panel.webview.postMessage({
                type: 'cliStatus',
                available: cliAvailable,
                version: version
            });
        } catch (error) {
            this.panel.webview.postMessage({
                type: 'cliStatus',
                available: false,
                version: 'Error checking CLI'
            });
        }
    }

    private async getWebviewContent(): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'my-project';

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spec Kit 项目初始化</title>
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
            max-width: 800px;
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

        .header p {
            color: var(--vscode-descriptionForeground);
        }

        .setup-section {
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }

        .project-info {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 10px;
            margin-bottom: 20px;
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

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .form-group input,
        .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
        }

        .ai-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .ai-option {
            display: flex;
            align-items: center;
            padding: 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            background-color: var(--vscode-input-background);
        }

        .ai-option:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .ai-option.selected {
            border-color: var(--vscode-textLink-foreground);
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .ai-option input[type="radio"] {
            margin-right: 8px;
        }

        .ai-option .ai-info {
            flex: 1;
        }

        .ai-option .ai-name {
            font-weight: 600;
            margin-bottom: 2px;
        }

        .ai-option .ai-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .button-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 30px;
            margin-bottom: 60px; /* 为底部状态栏留出空间 */
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
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
        }

        .status-item {
            display: inline-block;
            margin-right: 20px;
        }

        .status-success {
            color: var(--vscode-terminal-ansiGreen);
        }

        .status-error {
            color: var(--vscode-errorForeground);
        }

        .progress {
            display: none;
            text-align: center;
            padding: 20px;
            background-color: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            border-radius: 6px;
            margin: 20px 0;
        }

        .progress.show {
            display: block;
        }

        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-progressBar-background);
            border-radius: 50%;
            border-top-color: var(--vscode-button-background);
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .alert {
            padding: 12px;
            border-radius: 6px;
            margin: 10px 0;
            max-height: 200px;
            overflow-y: auto;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 12px;
        }

        .alert-success {
            background-color: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
        }

        .alert-error {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }

        .cli-status {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 20px;
            padding: 10px;
            border-radius: 6px;
            background-color: var(--vscode-input-background);
        }

        .cli-status.available {
            border-left: 4px solid var(--vscode-terminal-ansiGreen);
        }

        .cli-status.unavailable {
            border-left: 4px solid var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌱 Spec Kit 项目初始化</h1>
            <p>设置规范驱动开发项目</p>
        </div>

        <div id="cliStatus" class="cli-status">
            <span id="cliStatusText">检查 CLI 状态中...</span>
        </div>

        <div class="setup-section">
            <div class="section-title">项目信息</div>
            <div class="project-info">
                <div class="label">项目名称:</div>
                <div class="value" id="projectNameDisplay">${workspaceName}</div>
                <div class="label">工作路径:</div>
                <div class="value">${workspaceRoot || '当前目录'}</div>
                <div class="label">目标路径:</div>
                <div class="value" id="targetPathDisplay">${workspaceRoot}/${workspaceName}</div>
            </div>

            <div class="form-group">
                <label for="projectName">项目名称</label>
                <input type="text" id="projectName" value="${workspaceName}" placeholder="输入项目名称">
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="useCurrentDir" checked>
                <label for="useCurrentDir">在当前目录初始化 (--here)</label>
            </div>
        </div>

        <div class="setup-section">
            <div class="section-title">选择 AI 助手（点击选择）</div>
            <div class="ai-grid">
                <div class="ai-option selected" data-ai="claude">
                    <input type="radio" name="aiAssistant" value="claude" checked>
                    <div class="ai-info">
                        <div class="ai-name">Claude Code</div>
                        <div class="ai-desc">Anthropic Claude</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="copilot">
                    <input type="radio" name="aiAssistant" value="copilot">
                    <div class="ai-info">
                        <div class="ai-name">GitHub Copilot</div>
                        <div class="ai-desc">GitHub Copilot</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="gemini">
                    <input type="radio" name="aiAssistant" value="gemini">
                    <div class="ai-info">
                        <div class="ai-name">Gemini CLI</div>
                        <div class="ai-desc">Google Gemini</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="cursor-agent">
                    <input type="radio" name="aiAssistant" value="cursor-agent">
                    <div class="ai-info">
                        <div class="ai-name">Cursor</div>
                        <div class="ai-desc">Cursor IDE</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="qwen">
                    <input type="radio" name="aiAssistant" value="qwen">
                    <div class="ai-info">
                        <div class="ai-name">Qwen Code</div>
                        <div class="ai-desc">阿里巴巴 Qwen</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="opencode">
                    <input type="radio" name="aiAssistant" value="opencode">
                    <div class="ai-info">
                        <div class="ai-name">opencode</div>
                        <div class="ai-desc">opencode</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="codex">
                    <input type="radio" name="aiAssistant" value="codex">
                    <div class="ai-info">
                        <div class="ai-name">Codex CLI</div>
                        <div class="ai-desc">OpenAI Codex</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="windsurf">
                    <input type="radio" name="aiAssistant" value="windsurf">
                    <div class="ai-info">
                        <div class="ai-name">Windsurf</div>
                        <div class="ai-desc">Windsurf IDE</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="kilocode">
                    <input type="radio" name="aiAssistant" value="kilocode">
                    <div class="ai-info">
                        <div class="ai-name">Kilo Code</div>
                        <div class="ai-desc">Kilo Code</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="auggie">
                    <input type="radio" name="aiAssistant" value="auggie">
                    <div class="ai-info">
                        <div class="ai-name">Auggie CLI</div>
                        <div class="ai-desc">Auggie</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="codebuddy">
                    <input type="radio" name="aiAssistant" value="codebuddy">
                    <div class="ai-info">
                        <div class="ai-name">CodeBuddy</div>
                        <div class="ai-desc">CodeBuddy</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="roo">
                    <input type="radio" name="aiAssistant" value="roo">
                    <div class="ai-info">
                        <div class="ai-name">Roo Code</div>
                        <div class="ai-desc">Roo Code</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="q">
                    <input type="radio" name="aiAssistant" value="q">
                    <div class="ai-info">
                        <div class="ai-name">Amazon Q</div>
                        <div class="ai-desc">Amazon Q Developer CLI</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="amp">
                    <input type="radio" name="aiAssistant" value="amp">
                    <div class="ai-info">
                        <div class="ai-name">Amp</div>
                        <div class="ai-desc">Amp</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="shai">
                    <input type="radio" name="aiAssistant" value="shai">
                    <div class="ai-info">
                        <div class="ai-name">ShAI</div>
                        <div class="ai-desc">ShAI</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="bob">
                    <input type="radio" name="aiAssistant" value="bob">
                    <div class="ai-info">
                        <div class="ai-name">IBM Bob</div>
                        <div class="ai-desc">IBM Bob</div>
                    </div>
                </div>
                <div class="ai-option" data-ai="jules">
                    <input type="radio" name="aiAssistant" value="jules">
                    <div class="ai-info">
                        <div class="ai-name">Jules</div>
                        <div class="ai-desc">Jules</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="setup-section">
            <div class="section-title">高级选项</div>
            
            <div class="form-group">
                <label for="scriptType">脚本类型</label>
                <select id="scriptType">
                    <option value="sh">Shell (bash/zsh)</option>
                    <option value="ps">PowerShell</option>
                </select>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="enableGit" checked>
                <label for="enableGit">初始化 Git 仓库</label>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="enableDebug">
                <label for="enableDebug">启用调试模式</label>
            </div>
        </div>

        <div id="progress" class="progress">
            <div class="spinner"></div>
            <span id="progressText">正在初始化项目...</span>
        </div>

        <div id="alerts"></div>

        <div class="button-group">
            <button class="btn btn-secondary" onclick="window.close()">取消</button>
            <button class="btn btn-primary" id="initButton" onclick="initProject()">初始化项目</button>
        </div>
    </div>

    <div class="status-bar">
        <span class="status-item">Spec Kit CN - 规范驱动开发</span>
        <span class="status-item" id="statusCli">CLI: 检查中...</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // AI 选项点击处理
        document.querySelectorAll('.ai-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.ai-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input[type="radio"]').checked = true;
            });
        });

        // 项目名称变化处理
        document.getElementById('projectName').addEventListener('input', updatePaths);
        document.getElementById('useCurrentDir').addEventListener('change', updatePaths);

        function updatePaths() {
            const projectName = document.getElementById('projectName').value || 'my-project';
            const useCurrentDir = document.getElementById('useCurrentDir').checked;
            
            document.getElementById('projectNameDisplay').textContent = projectName;
            
            if (useCurrentDir) {
                document.getElementById('targetPathDisplay').textContent = '${workspaceRoot || '当前目录'}';
            } else {
                document.getElementById('targetPathDisplay').textContent = '${workspaceRoot}/' + projectName;
            }
        }

        // 初始化项目
        function initProject() {
            const projectName = document.getElementById('projectName').value.trim();
            const aiAssistant = document.querySelector('input[name="aiAssistant"]:checked').value;
            const scriptType = document.getElementById('scriptType').value;
            const useCurrentDir = document.getElementById('useCurrentDir').checked;
            const enableGit = document.getElementById('enableGit').checked;
            const enableDebug = document.getElementById('enableDebug').checked;

            if (!projectName) {
                showAlert('请输入项目名称', 'error');
                return;
            }

            vscode.postMessage({
                type: 'initProject',
                data: {
                    projectName,
                    aiAssistant,
                    scriptType,
                    useCurrentDir,
                    enableGit,
                    enableDebug
                }
            });
        }

        function showAlert(message, type) {
            const alerts = document.getElementById('alerts');
            const alert = document.createElement('div');
            alert.className = \`alert alert-\${type}\`;
            alert.textContent = message;
            alerts.appendChild(alert);
            
            setTimeout(() => {
                alert.remove();
            }, 5000);
        }

        function showProgress(show, message = '') {
            const progress = document.getElementById('progress');
            const progressText = document.getElementById('progressText');
            const initButton = document.getElementById('initButton');
            
            if (show) {
                progress.classList.add('show');
                progressText.textContent = message;
                initButton.disabled = true;
            } else {
                progress.classList.remove('show');
                initButton.disabled = false;
            }
        }

        function updateCliStatus(available, version) {
            const cliStatus = document.getElementById('cliStatus');
            const cliStatusText = document.getElementById('cliStatusText');
            const statusCli = document.getElementById('statusCli');
            
            if (available) {
                cliStatus.className = 'cli-status available';
                cliStatusText.textContent = \`✅ Spec Kit CLI 可用 (版本: \${version})\`;
                statusCli.textContent = \`CLI: \${version}\`;
                statusCli.className = 'status-item status-success';
            } else {
                cliStatus.className = 'cli-status unavailable';
                cliStatusText.textContent = '❌ Spec Kit CLI 不可用 - 请先安装 specify-cn CLI';
                statusCli.textContent = 'CLI: 不可用';
                statusCli.className = 'status-item status-error';
                document.getElementById('initButton').disabled = true;
            }
        }

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'cliStatus':
                    updateCliStatus(message.available, message.version);
                    break;
                case 'showProgress':
                    showProgress(true, message.message);
                    break;
                case 'initSuccess':
                    showProgress(false);
                    showAlert(message.message, 'success');
                    break;
                case 'initError':
                    showProgress(false);
                    showAlert(\`\${message.message}: \${message.error}\`, 'error');
                    break;
            }
        });

        // 初始化
        updatePaths();
        
        // 根据操作系统设置默认脚本类型
        if (navigator.platform.toLowerCase().includes('win')) {
            document.getElementById('scriptType').value = 'ps';
        }
    </script>
</body>
</html>`;
    }
}