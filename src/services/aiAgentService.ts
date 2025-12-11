import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface AiAgentResult {
    success: boolean;
    output: string;
    error?: string;
}

export interface AiAgentConfig {
    name: string;
    displayName: string;
    command: string;
    args?: string[];
    available: boolean;
}

/**
 * AI 代理服务 - 用于直接调用 AI 代理执行 slash commands
 */
export class AiAgentService {
    private agentProcess: ChildProcess | null = null;
    private outputChannel: vscode.OutputChannel;

    // 支持的 AI 代理配置
    private readonly agents: Record<string, AiAgentConfig> = {
        'claude': {
            name: 'claude',
            displayName: 'Claude Code',
            command: 'claude',
            available: false
        },
        'copilot': {
            name: 'copilot',
            displayName: 'GitHub Copilot',
            command: 'gh',
            args: ['copilot'],
            available: false
        },
        'cursor': {
            name: 'cursor',
            displayName: 'Cursor',
            command: 'cursor',
            available: false
        },
        'gemini': {
            name: 'gemini',
            displayName: 'Gemini CLI',
            command: 'gemini',
            available: false
        },
        'qwen': {
            name: 'qwen',
            displayName: 'Qwen Code',
            command: 'qwen',
            available: false
        },
        'codex': {
            name: 'codex',
            displayName: 'Codex CLI',
            command: 'codex',
            available: false
        }
    };

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Spec Kit AI Agent');
    }

    /**
     * 检查所有 AI 代理的可用性
     */
    async checkAgentsAvailability(): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};
        
        for (const [name, config] of Object.entries(this.agents)) {
            config.available = await this.checkAgentAvailable(config.command);
            results[name] = config.available;
        }
        
        return results;
    }

    /**
     * 检查单个 AI 代理是否可用
     */
    private async checkAgentAvailable(command: string): Promise<boolean> {
        return new Promise((resolve) => {
            const testCmd = process.platform === 'win32' ? 'where' : 'which';
            const child = spawn(testCmd, [command], { shell: true });
            
            child.on('close', (code) => {
                resolve(code === 0);
            });
            
            child.on('error', () => {
                resolve(false);
            });

            // 超时处理
            setTimeout(() => {
                child.kill();
                resolve(false);
            }, 5000);
        });
    }

    /**
     * 获取当前选择的 AI 代理（从 VS Code 配置读取）
     */
    getCurrentAgent(): string {
        const config = vscode.workspace.getConfiguration('spec-kit');
        return config.get<string>('defaultAiAssistant') || 'claude';
    }

    /**
     * 设置当前 AI 代理（保存到 VS Code 配置）
     */
    async setCurrentAgent(agent: string): Promise<void> {
        if (this.agents[agent]) {
            const config = vscode.workspace.getConfiguration('spec-kit');
            await config.update('defaultAiAssistant', agent, vscode.ConfigurationTarget.Workspace);
            logger.info(`AI agent set to: ${agent}`);
        }
    }

    /**
     * 获取所有可用的 AI 代理
     */
    getAvailableAgents(): AiAgentConfig[] {
        return Object.values(this.agents).filter(a => a.available);
    }

    /**
     * 在终端中执行 AI 代理命令
     * 真正的自动执行：直接调用 AI 代理 CLI，无需用户手动操作
     */
    async executeInTerminal(slashCommand: string, input?: string): Promise<void> {
        const agent = this.agents[this.currentAgent];
        if (!agent) {
            throw new Error(`Unknown AI agent: ${this.currentAgent}`);
        }

        // 构建完整命令
        let fullCommand = slashCommand;
        if (input && input.trim()) {
            fullCommand = `${slashCommand} ${input}`;
        }

        const workingDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workingDir) {
            throw new Error('No workspace folder found');
        }

        // 创建或获取终端
        const terminalName = `Spec Kit - ${agent.displayName}`;
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);
        
        if (!terminal) {
            terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd: workingDir
            });
        }

        terminal.show();

        this.outputChannel.appendLine(`[${new Date().toISOString()}] Auto-executing: ${fullCommand}`);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Agent: ${agent.displayName}`);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Working directory: ${workingDir}`);

        // 根据不同的 AI 代理发送命令
        // 关键：斜杠命令是给 AI 代理的提示，需要通过 AI 代理 CLI 执行
        switch (this.currentAgent) {
            case 'claude':
                // Claude Code CLI 真正的自动执行
                // 使用 claude 命令直接执行，Claude 会自动识别斜杠命令
                terminal.sendText(`claude "${fullCommand}"`);
                break;
            
            case 'gemini':
                // Gemini CLI - 使用 -p 参数传递提示
                terminal.sendText(`gemini -p "${fullCommand}"`);
                break;
            
            case 'qwen':
                // Qwen Code CLI
                terminal.sendText(`qwen "${fullCommand}"`);
                break;
            
            case 'codex':
                // Codex CLI
                terminal.sendText(`codex "${fullCommand}"`);
                break;
            
            case 'q':
                // Amazon Q Developer CLI
                terminal.sendText(`q chat "${fullCommand}"`);
                break;
            
            case 'auggie':
                // Auggie CLI
                terminal.sendText(`auggie "${fullCommand}"`);
                break;
            
            case 'opencode':
                // opencode CLI
                terminal.sendText(`opencode "${fullCommand}"`);
                break;
            
            case 'copilot':
                // GitHub Copilot - 通过 VS Code 命令打开聊天并自动输入
                await this.executeViaCopilot(fullCommand);
                return;
            
            case 'cursor':
                // Cursor - 通过 VS Code 命令
                await this.executeViaCursor(fullCommand);
                return;
            
            default:
                // 其他代理尝试直接在终端执行
                if (agent.command) {
                    terminal.sendText(`${agent.command} "${fullCommand}"`);
                } else {
                    // IDE 集成的代理，尝试通过 VS Code 命令执行
                    await this.executeViaVSCodeCommand('workbench.action.chat.open', fullCommand);
                    return;
                }
        }

        // 显示执行状态（不阻塞）
        vscode.window.setStatusBarMessage(`✅ 正在通过 ${agent.displayName} 执行命令...`, 5000);
    }

    /**
     * 通过 GitHub Copilot 执行命令
     */
    private async executeViaCopilot(command: string): Promise<void> {
        try {
            // 打开 Copilot 聊天
            await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
            
            // 等待界面打开
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 尝试直接发送消息到 Copilot
            try {
                await vscode.commands.executeCommand('workbench.action.chat.sendToNewChat', command);
            } catch {
                // 如果直接发送失败，复制到剪贴板并模拟粘贴
                await vscode.env.clipboard.writeText(command);
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            }
            
            vscode.window.setStatusBarMessage(`✅ 已发送到 GitHub Copilot`, 3000);
        } catch (error) {
            logger.error(`Failed to execute via Copilot: ${error}`);
            // 回退：复制到剪贴板
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage(`命令已复制，请在 Copilot 中粘贴执行`);
        }
    }

    /**
     * 通过 Cursor 执行命令
     */
    private async executeViaCursor(command: string): Promise<void> {
        try {
            // 尝试打开 Cursor AI 面板
            await vscode.commands.executeCommand('aipopup.action.modal.generate');
            
            // 等待界面打开
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 复制命令并粘贴
            await vscode.env.clipboard.writeText(command);
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            
            vscode.window.setStatusBarMessage(`✅ 已发送到 Cursor`, 3000);
        } catch (error) {
            logger.error(`Failed to execute via Cursor: ${error}`);
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage(`命令已复制，请在 Cursor 中粘贴执行`);
        }
    }

    /**
     * 通过 VS Code 命令执行（用于集成在 VS Code 中的 AI 代理）
     */
    private async executeViaVSCodeCommand(command: string, input: string): Promise<void> {
        try {
            // 先复制命令到剪贴板
            await vscode.env.clipboard.writeText(input);
            
            // 尝试执行 VS Code 命令打开对应的 AI 界面
            try {
                await vscode.commands.executeCommand(command);
                
                // 等待界面打开
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 尝试自动粘贴（模拟 Ctrl+V）
                try {
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                } catch {
                    // 如果粘贴失败，提示用户手动粘贴
                }
                
                // 提示用户
                vscode.window.showInformationMessage(
                    `✅ 已打开 AI 界面，命令已复制到剪贴板，请按 Ctrl+V 粘贴并回车执行`,
                    '确定'
                );
            } catch {
                // 如果命令不存在，提示用户
                vscode.window.showWarningMessage(
                    `无法打开 AI 界面，命令已复制到剪贴板，请手动打开 AI 助手并粘贴`,
                    '确定'
                );
            }
        } catch (error) {
            logger.error(`Failed to execute VS Code command: ${error}`);
            throw error;
        }
    }

    /**
     * 直接执行 Claude Code CLI 命令并获取输出
     * 这种方式适合非交互式命令
     */
    async executeClaudeCommand(slashCommand: string, input?: string): Promise<AiAgentResult> {
        return new Promise((resolve) => {
            const workingDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            
            let fullCommand = slashCommand;
            if (input && input.trim()) {
                fullCommand = `${slashCommand} ${input}`;
            }

            this.outputChannel.appendLine(`\n${'='.repeat(60)}`);
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Executing Claude command:`);
            this.outputChannel.appendLine(`Command: ${fullCommand}`);
            this.outputChannel.appendLine(`Working directory: ${workingDir}`);
            this.outputChannel.show();

            // 设置环境变量
            const env = this.getEnhancedEnv();

            // 使用 claude CLI 执行命令
            // Claude Code CLI 支持 -p 参数直接传递提示
            const child = spawn('claude', ['-p', fullCommand], {
                cwd: workingDir,
                shell: true,
                env: env
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                this.outputChannel.append(text);
            });

            child.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                this.outputChannel.append(`[stderr] ${text}`);
            });

            child.on('close', (code) => {
                this.outputChannel.appendLine(`\n[${new Date().toISOString()}] Process exited with code: ${code}`);
                
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr || undefined
                });
            });

            child.on('error', (error) => {
                this.outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${error.message}`);
                resolve({
                    success: false,
                    output: '',
                    error: error.message
                });
            });

            this.agentProcess = child;
        });
    }

    /**
     * 获取增强的环境变量
     */
    private getEnhancedEnv(): NodeJS.ProcessEnv {
        const env = { ...process.env };
        
        if (process.platform === 'win32') {
            const userProfile = process.env.USERPROFILE;
            const additionalPaths = [
                userProfile ? `${userProfile}\\.local\\bin` : '',
                userProfile ? `${userProfile}\\AppData\\Local\\Programs\\claude-code` : '',
                userProfile ? `${userProfile}\\AppData\\Roaming\\npm` : '',
            ].filter(Boolean);
            
            env.PATH = `${additionalPaths.join(';')};${env.PATH || ''}`;
        } else {
            const homeDir = process.env.HOME;
            const additionalPaths = [
                homeDir ? `${homeDir}/.local/bin` : '',
                '/usr/local/bin',
                '/opt/homebrew/bin',
            ].filter(Boolean);
            
            env.PATH = `${additionalPaths.join(':')}:${env.PATH || ''}`;
        }

        return env;
    }

    /**
     * 停止当前运行的 AI 代理进程
     */
    stopCurrentProcess(): void {
        if (this.agentProcess) {
            this.agentProcess.kill();
            this.agentProcess = null;
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Process stopped by user`);
        }
    }

    /**
     * 显示输出面板
     */
    showOutput(): void {
        this.outputChannel.show();
    }

    /**
     * 清除输出
     */
    clearOutput(): void {
        this.outputChannel.clear();
    }

    dispose(): void {
        this.stopCurrentProcess();
        this.outputChannel.dispose();
    }
}

// 单例实例
export const aiAgentService = new AiAgentService();
