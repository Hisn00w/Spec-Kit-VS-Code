import * as vscode from 'vscode';
import { specKitCliService } from '../services/specKitCliService';
import { aiAgentService } from '../services/aiAgentService';
import { ProjectInitWebView } from './ProjectInitWebView';
import { getLogger } from '../utils/logger';

const logger = getLogger();

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface SlashCommand {
    command: string;
    description: string;
    usage: string;
    category: 'core' | 'optional';
}

export class EnhancedChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'spec-kit-chat';
    
    private _view?: vscode.WebviewView;
    private _messages: ChatMessage[] = [];
    private _extensionUri: vscode.Uri;

    // 支持的斜杠命令
    private readonly slashCommands: SlashCommand[] = [
        // CLI 命令
        {
            command: '/speckit.init',
            description: '从最新模板初始化新的 Specify CN 项目',
            usage: '/speckit.init [项目名称] --ai claude --here',
            category: 'core'
        },
        {
            command: '/speckit.check',
            description: '检查已安装的工具 (git, claude, gemini, code, cursor-agent, windsurf 等)',
            usage: '/speckit.check',
            category: 'core'
        },
        {
            command: '/speckit.version',
            description: '显示版本和系统信息',
            usage: '/speckit.version',
            category: 'optional'
        },
        {
            command: '/speckit.setup',
            description: '自动安装和配置 Spec Kit CLI',
            usage: '/speckit.setup',
            category: 'core'
        },
        // 项目内斜杠命令（需要先初始化项目）
        {
            command: '/speckit.constitution',
            description: '创建或更新项目指导原则和开发指南',
            usage: '/speckit.constitution 创建专注于代码质量、测试标准、用户体验一致性和性能要求的原则',
            category: 'core'
        },
        {
            command: '/speckit.specify',
            description: '定义你想要构建的内容(需求和用户故事)',
            usage: '/speckit.specify 构建一个可以帮助我将照片整理到不同相册中的应用程序',
            category: 'core'
        },
        {
            command: '/speckit.plan',
            description: '使用你选择的技术栈创建技术实施计划',
            usage: '/speckit.plan 应用程序使用 React 和最少数量的库',
            category: 'core'
        },
        {
            command: '/speckit.tasks',
            description: '为实施生成可操作的任务列表',
            usage: '/speckit.tasks',
            category: 'core'
        },
        {
            command: '/speckit.implement',
            description: '执行所有任务并根据计划构建你的功能',
            usage: '/speckit.implement',
            category: 'core'
        },
        {
            command: '/speckit.clarify',
            description: '澄清未充分说明的区域(建议在 /speckit.plan 之前运行)',
            usage: '/speckit.clarify',
            category: 'optional'
        },
        {
            command: '/speckit.analyze',
            description: '跨制品一致性和覆盖范围分析',
            usage: '/speckit.analyze',
            category: 'optional'
        },
        {
            command: '/speckit.checklist',
            description: '生成自定义质量检查清单，验证需求的完整性、清晰度和一致性',
            usage: '/speckit.checklist',
            category: 'optional'
        }
    ];

    constructor(context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            logger.info(`Received message from webview: ${JSON.stringify(data)}`);
            console.log(`Received message from webview: ${JSON.stringify(data)}`);
            
            try {
                switch (data.type) {
                    case 'sendMessage':
                        logger.info(`Processing sendMessage: ${data.message}`);
                        await this._handleUserMessage(data.message);
                        break;
                    case 'clearChat':
                        logger.info('Processing clearChat');
                        this._clearChat();
                        break;
                    case 'showCommands':
                        logger.info('Processing showCommands');
                        this._showSlashCommands();
                        break;
                    case 'openInitDialog':
                        logger.info('Processing openInitDialog');
                        this._openInitDialog();
                        break;
                    case 'openWorkflow':
                        logger.info('Processing openWorkflow');
                        await this._openWorkflow();
                        break;
                    default:
                        logger.warn(`Unknown message type: ${data.type}`);
                        console.warn(`Unknown message type: ${data.type}`);
                }
            } catch (error) {
                logger.error(`Error handling webview message: ${error}`);
                console.error(`Error handling webview message: ${error}`);
                vscode.window.showErrorMessage(`处理消息时出错: ${error}`);
            }
        });
    }

    private async _handleUserMessage(message: string) {
        if (!message.trim()) return;

        // 添加用户消息
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        this._messages.push(userMessage);
        this._updateWebview();

        // 生成响应
        await this._generateResponse(message);
    }

    private async _generateResponse(userMessage: string) {
        // 显示正在输入状态
        this._sendMessage({
            type: 'typing',
            isTyping: true
        });

        try {
            let response = '';

            // 检查是否是斜杠命令
            if (userMessage.startsWith('/speckit.')) {
                response = await this._handleSlashCommand(userMessage);
            } else {
                // 处理自然语言命令
                response = await this._handleNaturalLanguage(userMessage);
            }

            this._addAssistantMessage(response);

        } catch (error) {
            logger.error(`Error generating response: ${error}`);
            
            // 确保停止输入状态
            this._sendMessage({
                type: 'typing',
                isTyping: false
            });

            const errorResponse = `❌ **处理请求时出错**

错误信息：${error instanceof Error ? error.message : String(error)}

**解决方案：**
- 输入 "/speckit.check" 验证CLI安装
- 重启VS Code后重试`;

            this._addAssistantMessage(errorResponse);
        }
    }

    private async _handleSlashCommand(command: string): Promise<string> {
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1).join(' ');

        // 快速获取项目状态（使用缓存，3秒超时）
        let projectStatus: any;
        try {
            projectStatus = await Promise.race([
                specKitCliService.getProjectStatus(),
                new Promise<any>((resolve) => setTimeout(() => resolve({
                    isInitialized: false,
                    hasConstitution: false,
                    hasSpecification: false,
                    hasPlan: false,
                    hasTasks: false,
                    workspaceRoot: ''
                }), 3000))
            ]);
        } catch {
            projectStatus = {
                isInitialized: false,
                hasConstitution: false,
                hasSpecification: false,
                hasPlan: false,
                hasTasks: false,
                workspaceRoot: ''
            };
        }

        switch (cmd) {
            case '/speckit.init':
                return await this._handleInitCommand(args, projectStatus);
            
            case '/speckit.check':
                return await this._handleCheckCommand(args, projectStatus);
            
            case '/speckit.version':
                return await this._handleVersionCommand(args, projectStatus);
            
            case '/speckit.setup':
                return await this._handleSetupCommand(args, projectStatus);
            
            // 项目内斜杠命令 - 需要在初始化的项目中使用
            case '/speckit.constitution':
                return await this._handleConstitutionCommand(args, projectStatus);
            case '/speckit.specify':
                return await this._handleSpecifyCommand(args, projectStatus);
            case '/speckit.plan':
                return await this._handlePlanCommand(args, projectStatus);
            case '/speckit.tasks':
                return await this._handleTasksCommand(args, projectStatus);
            case '/speckit.implement':
                return await this._handleImplementCommand(args, projectStatus);
            case '/speckit.clarify':
                return await this._handleClarifyCommand(args, projectStatus);
            case '/speckit.analyze':
                return await this._handleAnalyzeCommand(args, projectStatus);
            case '/speckit.checklist':
                return await this._handleChecklistCommand(args, projectStatus);
            
            default:
                return `❌ **未知的斜杠命令**

**CLI 命令：**
- \`/speckit.init\` - 初始化项目
- \`/speckit.check\` - 检查系统工具  
- \`/speckit.version\` - 显示版本信息

**项目内命令：**（需要先初始化项目）
- \`/speckit.constitution\` - 创建项目指导原则
- \`/speckit.specify\` - 定义功能需求
- \`/speckit.plan\` - 创建技术实施计划
- \`/speckit.tasks\` - 生成任务列表
- \`/speckit.implement\` - 执行实施

输入 "帮助" 查看详细使用说明。`;
        }
    }

    private async _handleConstitutionCommand(args: string, projectStatus: any): Promise<string> {
        if (!projectStatus.isInitialized) {
            // 自动初始化项目
            try {
                const currentAgent = aiAgentService.getCurrentAgent();
                const initResult = await specKitCliService.initProject(undefined, {
                    here: true,
                    ai: currentAgent,
                    force: true
                });

                if (!initResult.success) {
                    return `❌ **项目未初始化**

请先初始化项目：
\`\`\`bash
specify-cn init --here --ai claude
\`\`\`

或点击"初始化项目"按钮。`;
                }

                vscode.window.showInformationMessage('项目已自动初始化');
            } catch (error) {
                return `❌ **项目未初始化**

请先使用 \`/speckit.init\` 或点击"初始化项目"按钮。`;
            }
        }

        if (!args.trim()) {
            return `📋 **创建项目宪章 (/speckit.constitution)**

请提供项目原则描述。

**用法：**
\`/speckit.constitution 创建专注于代码质量、测试标准、用户体验一致性和性能要求的原则\``;
        }

        // 斜杠命令是给 AI 代理的提示，直接发送到 AI 代理执行
        const fullCommand = `/speckit.constitution ${args}`;
        
        try {
            // 直接通过 AI 代理执行斜杠命令
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `📋 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理（如 Claude Code）。

**请查看终端**，AI 代理正在：
1. 读取 \`.specify/templates/commands/constitution.md\` 模板
2. 根据你的描述生成项目原则
3. 创建 \`.specify/memory/constitution.md\` 文件

**下一步：** 完成后使用 \`/speckit.specify\` 来定义你想要构建的内容。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请确保已安装并启动 AI 代理（如 Claude Code），然后手动执行：
\`\`\`
${fullCommand}
\`\`\``;
        }
    }

    private async _handleSpecifyCommand(args: string, projectStatus: any): Promise<string> {
        if (!args.trim()) {
            return `📝 **定义项目规范 (/speckit.specify)**

请描述你想要构建的内容。专注于**做什么**和**为什么**，而不是技术栈。

**用法：**
\`/speckit.specify 构建一个可以帮助我将照片整理到不同相册中的应用程序\``;
        }

        const fullCommand = `/speckit.specify ${args}`;
        
        try {
            // 斜杠命令直接发送到 AI 代理执行
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `📝 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 分析你的需求描述
2. 创建功能规范和用户故事
3. 生成规范文档

**下一步：** 完成后使用 \`/speckit.plan\` 来创建技术实施计划。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handlePlanCommand(args: string, projectStatus: any): Promise<string> {
        if (!args.trim()) {
            return `🗺️ **创建技术实施计划 (/speckit.plan)**

请提供你的技术栈和架构选择。

**用法：**
\`/speckit.plan 应用程序使用 Vite 和最少数量的库\``;
        }

        const fullCommand = `/speckit.plan ${args}`;
        
        try {
            // 斜杠命令直接发送到 AI 代理执行
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `🗺️ **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 分析你的技术栈选择
2. 创建详细的实施计划
3. 生成技术文档和架构设计

**下一步：** 完成后使用 \`/speckit.tasks\` 来生成可操作的任务列表。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleTasksCommand(_args: string, projectStatus: any): Promise<string> {
        const fullCommand = `/speckit.tasks`;
        
        try {
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `📋 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 分析实施计划
2. 分解为可执行的任务
3. 生成任务列表文档

**下一步：** 完成后使用 \`/speckit.implement\` 开始执行实施。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleImplementCommand(_args: string, projectStatus: any): Promise<string> {
        const fullCommand = `/speckit.implement`;
        
        try {
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `🚀 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 读取任务列表
2. 按顺序执行每个任务
3. 生成代码和文件

⚠️ **注意：** 实施过程可能需要较长时间，请耐心等待。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleClarifyCommand(_args: string, projectStatus: any): Promise<string> {
        const fullCommand = `/speckit.clarify`;
        
        try {
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `🔍 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 分析当前规范
2. 识别模糊或不完整的区域
3. 提出澄清问题

**建议：** 在使用 \`/speckit.plan\` 之前运行此命令，可以减少后续的返工。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleAnalyzeCommand(_args: string, projectStatus: any): Promise<string> {
        const fullCommand = `/speckit.analyze`;
        
        try {
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `📊 **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 分析所有制品的一致性
2. 检查覆盖范围
3. 生成分析报告

**建议：** 在 \`/speckit.tasks\` 之后，\`/speckit.implement\` 之前运行。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleChecklistCommand(_args: string, projectStatus: any): Promise<string> {
        const fullCommand = `/speckit.checklist`;
        
        try {
            await aiAgentService.executeInTerminal(fullCommand);
            
            return `✅ **✅ 已发送到 AI 代理**

**命令：** \`${fullCommand}\`

✅ 命令已自动发送到终端中的 AI 代理。

**请查看终端**，AI 代理正在：
1. 验证需求的完整性
2. 检查清晰度和一致性
3. 生成质量检查清单

**建议：** 在 \`/speckit.plan\` 之后运行，确保进入实施阶段前质量达标。`;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return `❌ **发送失败**

错误：${errorMsg}

请手动在 AI 代理中执行：\`${fullCommand}\``;
        }
    }

    private async _handleInitCommand(args: string, projectStatus: any): Promise<string> {
        // 如果已经初始化，直接返回状态
        if (projectStatus.isInitialized) {
            return `✅ **项目已初始化**

当前项目状态：
- 📋 项目宪章: ${projectStatus.hasConstitution ? '✅ 已创建' : '❌ 未创建'}
- 📝 项目规范: ${projectStatus.hasSpecification ? '✅ 已创建' : '❌ 未创建'}
- 🗺️ 实施计划: ${projectStatus.hasPlan ? '✅ 已创建' : '❌ 未创建'}
- ✅ 任务列表: ${projectStatus.hasTasks ? '✅ 已创建' : '❌ 未创建'}

**下一步建议：**
${this._getNextStepSuggestion(projectStatus)}`;
        }

        // 直接打开可视化初始化界面（最快的方式）
        this._openInitDialog();
        
        return `🚀 **已打开项目初始化界面**

请在界面中：
1. 选择 AI 助手（默认 Claude）
2. 配置项目选项
3. 点击"初始化项目"按钮

**或者在终端中手动执行：**
\`\`\`bash
specify-cn init --here --ai claude
\`\`\``;
    }

    private async _handleCheckCommand(_args: string, projectStatus: any): Promise<string> {
        // 检查 CLI 是否可用
        const cliAvailable = await specKitCliService.checkCliAvailable();
        
        if (!cliAvailable) {
            return `❌ **Spec Kit CLI 不可用**

无法找到 \`specify-cn\` 命令。请确保已正确安装：

**安装步骤：**
1. 安装 uv：\`pip install uv\`
2. 安装 CLI：\`uv tool install specify-cn-cli --from git+https://github.com/linfee/spec-kit-cn.git\`
3. 更新 shell：\`uv tool update-shell\`
4. 重启 VS Code

**手动检查：**
在终端中运行：\`specify-cn --help\`

如果仍有问题，请检查 PATH 环境变量是否包含：
- Windows: \`%USERPROFILE%\\.local\\bin\`
- macOS/Linux: \`~/.local/bin\``;
        }

        // 直接执行检查命令并获取输出
        const result = await specKitCliService.executeCommand(['check']);
        const cliVersion = await specKitCliService.getCliVersion();
        
        return `🔍 **系统检查结果**

**执行命令：** \`specify-cn check\`

**CLI 信息：**
- Spec Kit CLI: ${cliVersion}
- 工作目录: ${projectStatus.workspaceRoot || '未设置'}
- 平台: ${process.platform}

**检查输出：**
\`\`\`
${result.output || '检查完成'}
\`\`\`

**项目进度：**
- 📋 项目初始化: ${projectStatus.isInitialized ? '✅ 完成' : '❌ 未完成'}
- 📋 项目宪章: ${projectStatus.hasConstitution ? '✅ 已创建' : '❌ 未创建'}
- 📝 项目规范: ${projectStatus.hasSpecification ? '✅ 已创建' : '❌ 未创建'}
- 🗺️ 实施计划: ${projectStatus.hasPlan ? '✅ 已创建' : '❌ 未创建'}
- ✅ 任务列表: ${projectStatus.hasTasks ? '✅ 已创建' : '❌ 未创建'}

**下一步建议：**
${this._getNextStepSuggestion(projectStatus)}`;
    }

    private async _handleVersionCommand(_args: string, projectStatus: any): Promise<string> {
        // 直接执行版本命令并获取输出
        const result = await specKitCliService.executeCommand(['version']);
        const cliVersion = await specKitCliService.getCliVersion();
        
        return `📋 **Spec Kit 版本信息**

**执行命令：** \`specify-cn version\`

**CLI 版本：** ${cliVersion}

**输出：**
\`\`\`
${result.output || cliVersion}
\`\`\`

**项目状态：**
- 工作目录: ${projectStatus.workspaceRoot || '未设置'}
- 平台: ${process.platform}`;
    }





    private async _handleSetupCommand(_args: string, projectStatus: any): Promise<string> {
        // 检测操作系统
        const isWindows = process.platform === 'win32';
        const isMacOS = process.platform === 'darwin';
        const isLinux = process.platform === 'linux';

        let setupCommands: string[] = [];

        if (isWindows) {
            setupCommands = [
                '# 检查 Python 和 pip',
                'python --version',
                'pip --version',
                '',
                '# 安装 uv',
                'pip install uv',
                '',
                '# 安装 Spec Kit CLI',
                'uv tool install specify-cn-cli --from git+https://github.com/linfee/spec-kit-cn.git',
                '',
                '# 更新 shell 配置',
                'uv tool update-shell',
                '',
                '# 刷新 PATH',
                '$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")',
                '',
                '# 验证安装',
                'specify-cn --help'
            ];
        } else if (isMacOS) {
            setupCommands = [
                '# 检查是否有 Python',
                'python3 --version || python --version',
                '',
                '# 安装 uv (如果没有)',
                'curl -LsSf https://astral.sh/uv/install.sh | sh',
                '',
                '# 重新加载 shell',
                'source ~/.bashrc || source ~/.zshrc',
                '',
                '# 安装 Spec Kit CLI',
                'uv tool install specify-cn-cli --from git+https://github.com/linfee/spec-kit-cn.git',
                '',
                '# 更新 shell 配置',
                'uv tool update-shell',
                '',
                '# 验证安装',
                'specify-cn --help'
            ];
        } else if (isLinux) {
            setupCommands = [
                '# 检查是否有 Python',
                'python3 --version || python --version',
                '',
                '# 安装 uv (如果没有)',
                'curl -LsSf https://astral.sh/uv/install.sh | sh',
                '',
                '# 重新加载 shell',
                'source ~/.bashrc',
                '',
                '# 安装 Spec Kit CLI',
                'uv tool install specify-cn-cli --from git+https://github.com/linfee/spec-kit-cn.git',
                '',
                '# 更新 shell 配置',
                'uv tool update-shell',
                '',
                '# 验证安装',
                'specify-cn --help'
            ];
        }

        // 在终端中执行安装命令
        const terminal = vscode.window.createTerminal({
            name: 'Spec Kit Setup',
            shellPath: isWindows ? 'powershell.exe' : undefined
        });
        
        terminal.show();
        
        // 逐条发送命令
        for (const command of setupCommands) {
            if (command.trim() && !command.startsWith('#')) {
                terminal.sendText(command);
                // 在命令之间添加小延迟
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return `🔧 **自动安装 Spec Kit CLI**

正在为 **${isWindows ? 'Windows' : isMacOS ? 'macOS' : 'Linux'}** 系统自动安装...

**安装步骤：**
${setupCommands.filter(cmd => cmd.startsWith('#')).map(cmd => `- ${cmd.substring(2)}`).join('\n')}

**请查看终端输出：**
- 绿色文本表示成功
- 红色文本表示错误，需要手动处理
- 如果看到 "specify-cn --help" 的输出，说明安装成功

**安装完成后：**
1. 重启 VS Code
2. 使用 \`/speckit.check\` 验证安装
3. 使用 \`/speckit.init\` 开始创建项目

**如果遇到问题：**
- 确保有网络连接
- 确保有 Python 环境
- 检查防火墙设置
- 手动运行终端中的命令`;
    }

    private async _handleNaturalLanguage(userMessage: string): Promise<string> {
        // 获取项目状态
        const projectStatus = await specKitCliService.getProjectStatus();
        let response = '';

        // 智能识别用户意图并自动执行
        if (userMessage.includes('初始化') || userMessage.includes('init') || userMessage.includes('创建项目')) {
            return await this._handleInitCommand('--here --ai claude', projectStatus);
        } 
        else if (userMessage.includes('宪章') || userMessage.includes('原则') || userMessage.includes('constitution')) {
            // 自动执行宪章命令
            const constitutionArgs = this._extractConstitutionArgs(userMessage);
            return await this._handleConstitutionCommand(constitutionArgs, projectStatus);
        }
        else if (userMessage.includes('规范') || userMessage.includes('需求') || userMessage.includes('specify')) {
            // 自动执行规范命令
            const specifyArgs = this._extractSpecifyArgs(userMessage);
            return await this._handleSpecifyCommand(specifyArgs, projectStatus);
        }
        else if (userMessage.includes('计划') || userMessage.includes('技术栈') || userMessage.includes('plan')) {
            // 自动执行计划命令
            const planArgs = this._extractPlanArgs(userMessage);
            return await this._handlePlanCommand(planArgs, projectStatus);
        }
        else if (userMessage.includes('任务') || userMessage.includes('tasks')) {
            return await this._handleTasksCommand('', projectStatus);
        }
        else if (userMessage.includes('实施') || userMessage.includes('implement') || userMessage.includes('开始开发')) {
            return await this._handleImplementCommand('', projectStatus);
        }
        else if (userMessage.includes('帮助') || userMessage.includes('help') || userMessage.includes('命令')) {
            this._showSlashCommands();
            return ''; // _showSlashCommands 会直接发送消息
        } 
        else if (userMessage.includes('查看状态') || userMessage.includes('status') || userMessage.includes('检查')) {
            return await this._handleCheckCommand('', projectStatus);
        } 
        else {
            // 默认帮助信息
            response = `🤖 **Spec Kit 智能助手**

我可以理解自然语言并自动执行相应的命令！

**� 项智能语音命令：**
- "初始化项目" → 自动执行项目初始化
- "创建宪章：专注代码质量" → 自动创建项目原则
- "定义需求：构建任务管理应用" → 自动创建功能规范
- "制定计划：使用React和TypeScript" → 自动创建技术计划
- "生成任务" → 自动生成任务列表
- "开始实施" → 自动执行项目实施
- "查看状态" → 检查项目进度

**🔧 精确斜杠命令：**
- \`/speckit.init\` - 初始化项目
- \`/speckit.constitution\` - 创建项目指导原则
- \`/speckit.specify\` - 定义功能需求
- \`/speckit.plan\` - 创建技术实施计划
- \`/speckit.tasks\` - 生成任务列表
- \`/speckit.implement\` - 执行实施

**💡 提示：** 
- 直接说出你想做什么，我会自动执行相应的命令
- 所有命令都会自动执行，无需手动操作
- 支持中文自然语言交互

试试说："初始化项目" 或 "创建宪章：专注用户体验"！`;
        }

        return response;
    }

    /**
     * 从自然语言中提取宪章参数
     */
    private _extractConstitutionArgs(message: string): string {
        // 提取冒号后的内容作为宪章描述
        const colonIndex = message.indexOf('：') || message.indexOf(':');
        if (colonIndex > -1) {
            return message.substring(colonIndex + 1).trim();
        }
        
        // 如果没有冒号，使用默认描述
        return '创建专注于代码质量、测试标准、用户体验一致性和性能要求的原则';
    }

    /**
     * 从自然语言中提取规范参数
     */
    private _extractSpecifyArgs(message: string): string {
        // 提取冒号后的内容作为需求描述
        const colonIndex = message.indexOf('：') || message.indexOf(':');
        if (colonIndex > -1) {
            return message.substring(colonIndex + 1).trim();
        }
        
        // 如果没有冒号，使用默认描述
        return '构建一个任务管理应用程序，支持创建、编辑和删除任务';
    }

    /**
     * 从自然语言中提取计划参数
     */
    private _extractPlanArgs(message: string): string {
        // 提取冒号后的内容作为技术栈描述
        const colonIndex = message.indexOf('：') || message.indexOf(':');
        if (colonIndex > -1) {
            return message.substring(colonIndex + 1).trim();
        }
        
        // 如果没有冒号，使用默认描述
        return '应用程序使用 React 和 TypeScript，采用现代化的前端技术栈';
    }

    private _openInitDialog() {
        const initWebView = new ProjectInitWebView(this._extensionUri);
        initWebView.show();
    }

    private async _openWorkflow() {
        const { WorkflowWebView } = await import('./WorkflowWebView');
        const workflowWebView = new WorkflowWebView(this._extensionUri);
        workflowWebView.show();
    }

    private _showSlashCommands() {
        const coreCommands = this.slashCommands.filter(cmd => cmd.category === 'core');
        const optionalCommands = this.slashCommands.filter(cmd => cmd.category === 'optional');

        const helpMessage = `📚 **Spec Kit 斜杠命令参考**

## 🔥 核心命令 (规范驱动开发工作流)

${coreCommands.map(cmd => `### \`${cmd.command}\`
**描述：** ${cmd.description}
**用法：** \`${cmd.usage}\`
`).join('\n')}

## 💡 可选命令 (质量增强)

${optionalCommands.map(cmd => `### \`${cmd.command}\`
**描述：** ${cmd.description}
**用法：** \`${cmd.usage}\`
`).join('\n')}

## 🚀 推荐工作流

1. **\`/speckit.constitution\`** - 建立项目原则
2. **\`/speckit.specify\`** - 定义功能需求
3. **\`/speckit.clarify\`** (可选) - 澄清细节
4. **\`/speckit.plan\`** - 制定技术计划
5. **\`/speckit.checklist\`** (可选) - 质量检查
6. **\`/speckit.tasks\`** - 分解任务
7. **\`/speckit.analyze\`** (可选) - 一致性分析
8. **\`/speckit.implement\`** - 开始实施

直接输入斜杠命令开始使用！`;

        this._addAssistantMessage(helpMessage);
    }

    private _getNextStepSuggestion(status: any): string {
        if (!status.isInitialized) {
            return '使用命令面板初始化项目';
        } else if (!status.hasConstitution) {
            return '使用 `/speckit.constitution` 建立项目原则';
        } else if (!status.hasSpecification) {
            return '使用 `/speckit.specify` 定义功能需求';
        } else if (!status.hasPlan) {
            return '使用 `/speckit.plan` 制定技术计划';
        } else if (!status.hasTasks) {
            return '使用 `/speckit.tasks` 生成任务列表';
        } else {
            return '使用 `/speckit.implement` 开始实施！';
        }
    }

    private _addAssistantMessage(content: string) {
        const assistantMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: content,
            timestamp: Date.now()
        };
        this._messages.push(assistantMessage);

        // 停止输入状态并更新界面
        this._sendMessage({
            type: 'typing',
            isTyping: false
        });
        this._updateWebview();
    }

    private _clearChat(): void {
        this._messages = [];
        this._updateWebview();
    }

    private _updateWebview(): void {
        if (this._view) {
            this._sendMessage({
                type: 'updateMessages',
                messages: this._messages
            });
        }
    }

    private _sendMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Spec Kit Chat</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .chat-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .chat-title {
            font-weight: 600;
            font-size: 14px;
        }

        .header-buttons {
            display: flex;
            gap: 8px;
        }

        .header-button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }

        .header-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 100%;
        }

        .message.user {
            align-items: flex-end;
        }

        .message.assistant {
            align-items: flex-start;
        }

        .message-content {
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 85%;
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.4;
        }

        .message.user .message-content {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant .message-content {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }

        .message-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            padding: 0 4px;
        }

        .typing-indicator {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .typing-dots {
            display: inline-flex;
            margin-left: 8px;
        }

        .typing-dots span {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
            margin: 0 1px;
            animation: typing 1.4s infinite ease-in-out;
        }

        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes typing {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
            40% { transform: scale(1); opacity: 1; }
        }

        .input-container {
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        .message-input {
            flex: 1;
            min-height: 36px;
            max-height: 120px;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: none;
            outline: none;
        }

        .message-input:focus {
            border-color: var(--vscode-focusBorder);
        }

        .send-button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
            height: 36px;
        }

        .send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .welcome-message {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .welcome-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .welcome-subtitle {
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 20px;
        }

        .quick-actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 300px;
            margin: 0 auto;
        }

        .quick-action {
            padding: 8px 16px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 6px;
            cursor: pointer;
            text-align: center;
            font-size: 13px;
            transition: background-color 0.2s;
        }

        .quick-action:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .slash-command {
            font-family: 'Courier New', monospace;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 12px;
        }

        /* Markdown 样式 */
        .message-content h2, .message-content h3, .message-content h4 {
            margin: 8px 0 4px 0;
            font-weight: 600;
        }
        .message-content h2 { font-size: 16px; }
        .message-content h3 { font-size: 14px; }
        .message-content h4 { font-size: 13px; }

        .message-content strong {
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .message-content em {
            font-style: italic;
        }

        .message-content .inline-code {
            font-family: 'Consolas', 'Monaco', monospace;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
        }

        .message-content .code-block {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }

        .message-content ul {
            margin: 4px 0;
            padding-left: 20px;
        }

        .message-content li {
            margin: 2px 0;
            list-style-type: disc;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <div class="chat-title">🌱 Spec Kit 助手</div>
            <div class="header-buttons">
                <button class="header-button" data-action="openWorkflow">工作流</button>
                <button class="header-button" data-action="showCommands">命令</button>
                <button class="header-button" data-action="clearChat">清空</button>
            </div>
        </div>
        
        <div class="messages-container" id="messagesContainer">
            <!-- Messages will be rendered here by JavaScript -->
        </div>
        
        <div class="typing-indicator" id="typingIndicator" style="display: none;">
            正在思考中<div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
        
        <div class="input-container">
            <div class="input-wrapper">
                <textarea 
                    id="messageInput" 
                    class="message-input" 
                    placeholder="输入斜杠命令或自然语言..."
                    rows="1"
                ></textarea>
                <button id="sendButton" class="send-button">发送</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            'use strict';
            
            console.log('Script starting...');
            
            // 获取 VSCode API
            const vscode = acquireVsCodeApi();
            console.log('VSCode API acquired');
            
            let messages = [];
            let initialized = false;

            // 确保只初始化一次
            function safeInitialize() {
                if (initialized) return;
                initialized = true;
                console.log('Initializing event listeners (once)');
                initializeEventListeners();
            }

            // 等待 DOM 加载完成
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', safeInitialize);
            } else {
                safeInitialize();
            }

            function initializeEventListeners() {
                console.log('Initializing event listeners');
                
                // 输入框事件
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    console.log('Message input found');
                    
                    messageInput.addEventListener('input', function() {
                        this.style.height = 'auto';
                        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                    });

                    messageInput.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            window.sendMessage();
                        }
                    });
                } else {
                    console.error('Message input not found');
                }

                // 发送按钮事件
                const sendButton = document.getElementById('sendButton');
                if (sendButton) {
                    console.log('Send button found');
                    sendButton.addEventListener('click', window.sendMessage);
                } else {
                    console.error('Send button not found');
                }

                // 事件委托 - 处理所有按钮点击
                document.addEventListener('click', function(e) {
                    const target = e.target;
                    const action = target.getAttribute('data-action');
                    
                    if (action) {
                        console.log('Button clicked with action:', action);
                        e.preventDefault();
                        
                        switch (action) {
                            case 'sendQuickMessage':
                                const message = target.getAttribute('data-message');
                                if (message) {
                                    window.sendQuickMessage(message);
                                }
                                break;
                            case 'openWorkflow':
                                window.openWorkflow();
                                break;
                            case 'showCommands':
                                window.showCommands();
                                break;
                            case 'clearChat':
                                window.clearChat();
                                break;
                            case 'openInitDialog':
                                window.openInitDialog();
                                break;
                            default:
                                console.warn('Unknown action:', action);
                        }
                    }
                });
            }

            // 全局函数定义
            window.sendMessage = function() {
                console.log('sendMessage called');
                const input = document.getElementById('messageInput');
                if (!input) {
                    console.error('Input element not found');
                    return;
                }
                
                const message = input.value.trim();
                console.log('Message to send:', message);
                
                if (message) {
                    try {
                        vscode.postMessage({
                            type: 'sendMessage',
                            message: message
                        });
                        console.log('Message sent to extension');
                        input.value = '';
                        input.style.height = 'auto';
                    } catch (error) {
                        console.error('Error sending message:', error);
                    }
                } else {
                    console.log('Empty message, not sending');
                }
            };

            window.sendQuickMessage = function(message) {
                console.log('sendQuickMessage called with:', message);
                try {
                    vscode.postMessage({
                        type: 'sendMessage',
                        message: message
                    });
                    console.log('Quick message sent to extension');
                } catch (error) {
                    console.error('Error sending quick message:', error);
                }
            };

            window.clearChat = function() {
                console.log('clearChat called');
                try {
                    vscode.postMessage({
                        type: 'clearChat'
                    });
                    console.log('Clear chat message sent');
                } catch (error) {
                    console.error('Error clearing chat:', error);
                }
            };

            window.showCommands = function() {
                console.log('showCommands called');
                try {
                    vscode.postMessage({
                        type: 'showCommands'
                    });
                    console.log('Show commands message sent');
                } catch (error) {
                    console.error('Error showing commands:', error);
                }
            };

            window.openInitDialog = function() {
                console.log('openInitDialog called');
                try {
                    vscode.postMessage({
                        type: 'openInitDialog'
                    });
                    console.log('Open init dialog message sent');
                } catch (error) {
                    console.error('Error opening init dialog:', error);
                }
            };

            window.openWorkflow = function() {
                console.log('openWorkflow called');
                try {
                    vscode.postMessage({
                        type: 'openWorkflow'
                    });
                    console.log('Open workflow message sent');
                } catch (error) {
                    console.error('Error opening workflow:', error);
                }
            };

            window.formatTime = function(timestamp) {
                const date = new Date(timestamp);
                return date.toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            };

            // 简单的 Markdown 渲染器
            window.renderMarkdown = function(text) {
                if (!text) return '';
                
                let html = text
                    // 转义 HTML 特殊字符
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    // 代码块
                    .replace(/\x60\x60\x60(\\w*)\\n([\\s\\S]*?)\x60\x60\x60/g, '<pre class="code-block"><code>$2</code></pre>')
                    // 行内代码
                    .replace(/\x60([^\x60]+)\x60/g, '<code class="inline-code">$1</code>')
                    // 粗体
                    .replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>')
                    // 斜体
                    .replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>')
                    // 标题
                    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
                    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
                    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
                    // 无序列表
                    .replace(/^- (.+)$/gm, '<li>$1</li>')
                    // 有序列表
                    .replace(/^(\\d+)\\. (.+)$/gm, '<li>$2</li>')
                    // 换行
                    .replace(/\\n/g, '<br>');
                
                // 包装连续的 li 为 ul
                html = html.replace(/(<li>.*?<\\/li>)(<br>)?(<li>)/g, '$1$3');
                html = html.replace(/(<li>.*?<\\/li>)/g, '<ul>$1</ul>');
                html = html.replace(/<\\/ul><ul>/g, '');
                
                return html;
            };

            window.renderMessages = function() {
                console.log('renderMessages called, messages count:', messages.length);
                const container = document.getElementById('messagesContainer');
                if (!container) {
                    console.error('Messages container not found');
                    return;
                }
                
                if (messages.length === 0) {
                    container.innerHTML = \`
                        <div class="welcome-message">
                            <div class="welcome-title">🌱 欢迎使用 Spec Kit</div>
                            <div class="welcome-subtitle">规范驱动开发助手，支持完整的斜杠命令工作流。</div>
                            <div class="quick-actions">
                                <div class="quick-action" data-action="sendQuickMessage" data-message="/speckit.init">🚀 初始化项目</div>
                                <div class="quick-action" data-action="openWorkflow">🔄 打开工作流</div>
                                <div class="quick-action" data-action="sendQuickMessage" data-message="/speckit.constitution 创建专注于代码质量的原则">📋 /speckit.constitution</div>
                                <div class="quick-action" data-action="sendQuickMessage" data-message="/speckit.specify 构建一个任务管理应用">📝 /speckit.specify</div>
                                <div class="quick-action" data-action="sendQuickMessage" data-message="/speckit.check">🔍 检查状态</div>
                                <div class="quick-action" data-action="sendQuickMessage" data-message="帮助">❓ 查看所有命令</div>
                            </div>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = messages.map(msg => \`
                    <div class="message \${msg.role}">
                        <div class="message-content">\${msg.role === 'assistant' ? window.renderMarkdown(msg.content) : msg.content}</div>
                        <div class="message-time">\${window.formatTime(msg.timestamp)}</div>
                    </div>
                \`).join('');
                
                // 滚动到底部
                container.scrollTop = container.scrollHeight;
            };

            // 监听来自扩展的消息
            window.addEventListener('message', function(event) {
                console.log('Received message from extension:', event.data);
                const message = event.data;
                
                switch (message.type) {
                    case 'updateMessages':
                        messages = message.messages;
                        window.renderMessages();
                        break;
                    case 'typing':
                        const typingIndicator = document.getElementById('typingIndicator');
                        if (typingIndicator) {
                            typingIndicator.style.display = message.isTyping ? 'flex' : 'none';
                            if (message.isTyping) {
                                const container = document.getElementById('messagesContainer');
                                if (container) {
                                    container.scrollTop = container.scrollHeight;
                                }
                            }
                        }
                        break;
                }
            });

            // 全局错误处理
            window.addEventListener('error', function(e) {
                console.error('Global JavaScript error:', e.error, e.filename, e.lineno);
            });

            // 初始渲染
            setTimeout(function() {
                window.renderMessages();
                console.log('Initial render completed');
            }, 100);

        })(); // 立即执行函数结束
    </script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}