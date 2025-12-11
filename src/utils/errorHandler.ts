import * as vscode from 'vscode';

export enum ErrorType {
    CLI_NOT_FOUND = 'CLI_NOT_FOUND',
    CLI_VERSION_INCOMPATIBLE = 'CLI_VERSION_INCOMPATIBLE',
    COMMAND_EXECUTION_FAILED = 'COMMAND_EXECUTION_FAILED',
    PROJECT_NOT_INITIALIZED = 'PROJECT_NOT_INITIALIZED',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    NETWORK_ERROR = 'NETWORK_ERROR',
    AI_AGENT_NOT_FOUND = 'AI_AGENT_NOT_FOUND',
    GIT_ERROR = 'GIT_ERROR',
    PERMISSION_ERROR = 'PERMISSION_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class SpecifyError extends Error {
    public readonly type: ErrorType;
    public readonly context: string;
    public readonly suggestions: string[];
    public readonly code?: string;

    constructor(
        type: ErrorType,
        message: string,
        context: string,
        suggestions: string[] = [],
        code?: string
    ) {
        super(message);
        this.type = type;
        this.context = context;
        this.suggestions = suggestions;
        this.code = code;
        this.name = 'SpecifyError';
    }
}

export class ErrorHandler {
    private static readonly outputChannel = vscode.window.createOutputChannel('Spec Kit');
    private static readonly debugMode = vscode.workspace.getConfiguration('spec-kit').get<boolean>('debug', false);

    /**
     * Handle errors with user-friendly messages and suggestions
     */
    public static async handle(error: Error | SpecifyError, context?: string): Promise<void> {
        const specifyError = error instanceof SpecifyError
            ? error
            : this.categorizeError(error, context || 'Unknown');

        // Log to output channel
        this.logError(specifyError);

        // Show user notification with actions
        await this.showErrorNotification(specifyError);
    }

    /**
     * Categorize generic errors into SpecifyError types
     */
    private static categorizeError(error: Error, context: string): SpecifyError {
        const message = error.message.toLowerCase();

        // CLI not found
        if (message.includes('command not found') || message.includes('not recognized') || message.includes('enoent')) {
            return new SpecifyError(
                ErrorType.CLI_NOT_FOUND,
                'specify-cn CLI 工具未找到',
                context,
                [
                    '安装 specify-cn CLI: pip install specify-cn',
                    '确认 specify-cn 在系统 PATH 中',
                    '重启 VS Code'
                ],
                'SPEC_KIT_CLI_NOT_FOUND'
            );
        }

        // Version incompatible
        if (message.includes('version') || message.includes('incompatible')) {
            return new SpecifyError(
                ErrorType.CLI_VERSION_INCOMPATIBLE,
                'specify-cn CLI 版本不兼容',
                context,
                [
                    '升级 specify-cn 到最新版本: pip install --upgrade specify-cn',
                    '查看版本要求: specify-cn --version'
                ],
                'SPEC_KIT_CLI_VERSION'
            );
        }

        // Permission denied
        if (message.includes('permission denied') || message.includes('eacces')) {
            return new SpecifyError(
                ErrorType.PERMISSION_ERROR,
                '权限不足',
                context,
                [
                    '检查文件/目录权限',
                    '以管理员身份运行 VS Code (Windows)',
                    '修改文件/目录所有者 (Linux/macOS)'
                ],
                'SPEC_KIT_PERMISSION'
            );
        }

        // Network related
        if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
            return new SpecifyError(
                ErrorType.NETWORK_ERROR,
                '网络连接错误',
                context,
                [
                    '检查网络连接',
                    '配置代理 (如需要)',
                    '重试操作'
                ],
                'SPEC_KIT_NETWORK'
            );
        }

        // Git related
        if (message.includes('git') || message.includes('repository')) {
            return new SpecifyError(
                ErrorType.GIT_ERROR,
                'Git 操作失败',
                context,
                [
                    '确认 Git 已安装',
                    '检查 Git 配置: git config --list',
                    '初始化 Git 仓库: git init'
                ],
                'SPEC_KIT_GIT'
            );
        }

        // Default unknown error
        return new SpecifyError(
            ErrorType.UNKNOWN_ERROR,
            `未知错误: ${error.message}`,
            context,
            [
                '查看输出通道获取详细信息',
                '启用调试模式获取更多日志',
                '报告此问题给开发团队'
            ],
            'SPEC_KIT_UNKNOWN'
        );
    }

    /**
     * Log error to output channel
     */
    private static logError(error: SpecifyError): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${error.type}`);
        this.outputChannel.appendLine(`Context: ${error.context}`);
        this.outputChannel.appendLine(`Message: ${error.message}`);

        if (error.code) {
            this.outputChannel.appendLine(`Code: ${error.code}`);
        }

        if (this.debugMode) {
            this.outputChannel.appendLine('Stack trace:');
            this.outputChannel.appendLine(error.stack || 'No stack trace available');
        }

        this.outputChannel.appendLine('---');
        this.outputChannel.show(); // Show on errors
    }

    /**
     * Show error notification with actionable buttons
     */
    private static async showErrorNotification(error: SpecifyError): Promise<void> {
        const message = `${error.message} (${error.context})`;

        // Create action buttons based on error type and suggestions
        const actions: vscode.MessageItem[] = [];

        // Add common actions
        actions.push({
            title: '查看日志',
            action: 'viewLogs'
        } as vscode.MessageItem & { action: string });

        // Add specific actions based on error type
        switch (error.type) {
            case ErrorType.CLI_NOT_FOUND:
                actions.push({
                    title: '安装说明',
                    action: 'installDocs'
                } as vscode.MessageItem & { action: string });
                break;

            case ErrorType.CLI_VERSION_INCOMPATIBLE:
                actions.push({
                    title: '升级 CLI',
                    action: 'upgradeCli'
                } as vscode.MessageItem & { action: string });
                break;

            case ErrorType.PROJECT_NOT_INITIALIZED:
                actions.push({
                    title: '初始化项目',
                    action: 'initProject'
                } as vscode.MessageItem & { action: string });
                break;

            case ErrorType.NETWORK_ERROR:
                actions.push({
                    title: '重试',
                    action: 'retry'
                } as vscode.MessageItem & { action: string });
                break;
        }

        // Always add dismiss action
        actions.push({
            title: '关闭',
            action: 'dismiss'
        } as vscode.MessageItem & { action: string });

        // Show notification
        const choice = await vscode.window.showErrorMessage(
            message,
            ...actions
        );

        // Handle action selection
        if (choice) {
            await this.handleAction(choice);
        }
    }

    /**
     * Handle user action selection
     */
    private static async handleAction(action: vscode.MessageItem): Promise<void> {
        const actionWithId = action as vscode.MessageItem & { action: string };

        switch (actionWithId.action) {
            case 'viewLogs':
                this.outputChannel.show();
                break;

            case 'installDocs':
                await vscode.env.openExternal(vscode.Uri.parse('https://github.com/github/spec-kit#installation'));
                break;

            case 'upgradeCli':
                await this.executeCommandInTerminal('pip install --upgrade specify-cn');
                break;

            case 'initProject':
                vscode.commands.executeCommand('spec-kit.init');
                break;

            case 'retry':
                // This would need to be implemented based on the retry context
                vscode.window.showInformationMessage('请手动重试操作');
                break;

            case 'dismiss':
            default:
                // Do nothing
                break;
        }
    }

    /**
     * Execute command in integrated terminal
     */
    private static async executeCommandInTerminal(command: string): Promise<void> {
        const terminal = vscode.window.createTerminal({
            name: 'Spec Kit CLI',
            hideFromUser: false
        });

        terminal.sendText(command);
        terminal.show();
    }

    /**
     * Log debug information
     */
    public static debug(message: string, data?: unknown): void {
        if (this.debugMode) {
            const timestamp = new Date().toISOString();
            this.outputChannel.appendLine(`[${timestamp}] DEBUG: ${message}`);
            if (data) {
                this.outputChannel.appendLine(JSON.stringify(data, null, 2));
            }
        }
    }

    /**
     * Log info message
     */
    public static info(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] INFO: ${message}`);
    }

    /**
     * Log warning message
     */
    public static warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] WARN: ${message}`);
    }

    /**
     * Show success message
     */
    public static async success(message: string): Promise<void> {
        await vscode.window.showInformationMessage(message);
        this.info(`SUCCESS: ${message}`);
    }

    /**
     * Dispose output channel
     */
    public static dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * Try to execute an operation with error handling
 */
export async function tryCatch<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: T
): Promise<T | undefined> {
    try {
        return await operation();
    } catch (error) {
        await ErrorHandler.handle(error as Error, context);
        return fallback;
    }
}

/**
 * Create a CLI-specific error
 */
export function createCliError(message: string, command: string, exitCode?: number): SpecifyError {
    const suggestions = [
        '检查 specify-cn 是否正确安装',
        '确认命令参数正确',
        '查看输出通道获取详细信息'
    ];

    if (exitCode === 1) {
        suggestions.push('检查项目是否已初始化');
    }

    return new SpecifyError(
        ErrorType.COMMAND_EXECUTION_FAILED,
        `CLI 命令执行失败: ${message}`,
        `Command: ${command}`,
        suggestions,
        `EXIT_CODE_${exitCode || 'UNKNOWN'}`
    );
}

/**
 * Validate CLI output for errors
 */
export function validateCliOutput(output: string, command: string): void {
    // Check for common error patterns in CLI output
    const errorPatterns = [
        /error: /i,
        /failed: /i,
        /unable to /i,
        /cannot /i,
        /permission denied/i,
        /not found/i,
        /no such file/i
    ];

    for (const pattern of errorPatterns) {
        if (pattern.test(output)) {
            throw createCliError(output.split('\n')[0], command);
        }
    }
}