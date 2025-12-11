import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface CliCommandResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
}

export interface ProjectStatus {
    isInitialized: boolean;
    hasConstitution: boolean;
    hasSpecification: boolean;
    hasPlan: boolean;
    hasTasks: boolean;
    workspaceRoot: string;
}

// AI 助手配置
export const AI_ASSISTANTS = {
    'claude': { name: 'Claude Code', description: 'Anthropic Claude' },
    'copilot': { name: 'GitHub Copilot', description: 'GitHub Copilot' },
    'gemini': { name: 'Gemini CLI', description: 'Google Gemini' },
    'cursor-agent': { name: 'Cursor', description: 'Cursor IDE' },
    'qwen': { name: 'Qwen Code', description: '阿里巴巴 Qwen' },
    'opencode': { name: 'opencode', description: 'opencode' },
    'codex': { name: 'Codex CLI', description: 'OpenAI Codex' },
    'windsurf': { name: 'Windsurf', description: 'Windsurf IDE' },
    'kilocode': { name: 'Kilo Code', description: 'Kilo Code' },
    'auggie': { name: 'Auggie CLI', description: 'Auggie' },
    'codebuddy': { name: 'CodeBuddy', description: 'CodeBuddy' },
    'roo': { name: 'Roo Code', description: 'Roo Code' },
    'q': { name: 'Amazon Q', description: 'Amazon Q Developer CLI' },
    'amp': { name: 'Amp', description: 'Amp' },
    'shai': { name: 'ShAI', description: 'ShAI' },
    'bob': { name: 'IBM Bob', description: 'IBM Bob' },
    'jules': { name: 'Jules', description: 'Jules' },
};

export class SpecKitCliService {
    private cliPath: string = 'specify-cn';
    private possiblePaths: string[] = [
        'specify-cn',
        'specify-cn.exe'
    ];
    private statusCache: { status: ProjectStatus; timestamp: number } | null = null;
    private readonly CACHE_DURATION = 5000; // 5秒缓存

    constructor() {
        const config = vscode.workspace.getConfiguration('spec-kit');
        const customPath = config.get<string>('cliPath');
        if (customPath) {
            this.cliPath = customPath;
        }
    }

    /**
     * 尝试找到可用的 CLI 路径
     */
    private async findCliPath(): Promise<string> {
        // 首先尝试配置的路径
        if (await this.testCliPath(this.cliPath)) {
            return this.cliPath;
        }

        // 构建所有可能的路径
        const allPossiblePaths: string[] = [...this.possiblePaths];

        // 在 Windows 上，添加用户特定的 .local\bin 路径
        if (process.platform === 'win32') {
            const userProfile = process.env.USERPROFILE;
            if (userProfile) {
                const userLocalBinPaths = [
                    `${userProfile}\\.local\\bin\\specify-cn.exe`,
                    `${userProfile}\\.local\\bin\\specify-cn`,
                    `${userProfile}\\.local\\bin\\specify-cn.cmd`,
                    `${userProfile}\\.local\\bin\\specify-cn.bat`
                ];
                allPossiblePaths.unshift(...userLocalBinPaths);
            }
        } else {
            const homeDir = process.env.HOME;
            if (homeDir) {
                const unixLocalBinPaths = [
                    `${homeDir}/.local/bin/specify-cn`,
                    `${homeDir}/.local/bin/specify-cn.exe`
                ];
                allPossiblePaths.unshift(...unixLocalBinPaths);
            }
        }

        // 尝试所有可能的路径
        for (const testPath of allPossiblePaths) {
            if (await this.pathExists(testPath)) {
                logger.info(`Found CLI executable at: ${testPath}`);
                try {
                    const testResult = await this.runCommandWithPath(testPath, ['--help'], undefined);
                    if (testResult.success) {
                        logger.info(`CLI is working at: ${testPath}`);
                        return testPath;
                    }
                } catch (error) {
                    logger.warn(`CLI test failed for ${testPath}: ${error}`);
                }
            }
        }

        logger.warn('CLI not found in any expected location, using default path');
        return this.cliPath;
    }

    /**
     * 测试 CLI 路径是否可用
     */
    private async testCliPath(testPath: string): Promise<boolean> {
        try {
            if (process.platform === 'win32') {
                try {
                    const cmdResult = await this.runCommandWithPath('cmd', ['/c', testPath, '--help'], undefined);
                    if (cmdResult.success) {
                        return true;
                    }
                } catch {
                    // CMD 失败，继续测试 PowerShell
                }

                try {
                    const psResult = await this.runCommandWithPath('powershell', ['-Command', testPath, '--help'], undefined);
                    return psResult.success;
                } catch {
                    return false;
                }
            } else {
                const result = await this.runCommandWithPath(testPath, ['--help'], undefined);
                return result.success;
            }
        } catch {
            return false;
        }
    }

    /**
     * 检查 CLI 是否可用
     */
    async checkCliAvailable(): Promise<boolean> {
        try {
            const result = await this.runCommand(['--help']);
            return result.success;
        } catch (error) {
            logger.error(`CLI check failed: ${error}`);
            return false;
        }
    }

    /**
     * 清理 ANSI 转义码、控制字符和 ASCII 艺术
     */
    private stripAnsi(text: string): string {
        // 移除所有 ANSI 转义码和控制字符
        // eslint-disable-next-line no-control-regex
        let cleaned = text
            .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')           // CSI sequences (颜色等)
            .replace(/\x1B\][^\x07]*\x07/g, '')              // OSC sequences
            .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '')         // Private sequences
            .replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, '')        // DCS, SOS, PM, APC sequences
            .replace(/\x1B\([A-Z]/g, '')                      // Character set selection
            .replace(/\x1B[=>]/g, '')                         // Keypad modes
            .replace(/\x1B[78]/g, '')                         // Save/restore cursor
            .replace(/\x1B[DEHMNOPVWXYZ\\^_]/g, '')          // Various control sequences
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control characters (except \t \n \r)
            .replace(/\x1B/g, '');                            // Any remaining escape characters
        
        // 过滤掉 ASCII 艺术行（包含大量方块字符或边框字符的行）
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter(line => {
            // 移除只包含边框字符的行
            const borderChars = /^[\s─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬█▀▄░▒▓\-\|+]+$/;
            if (borderChars.test(line.trim())) {
                return false;
            }
            // 移除 ASCII 艺术 logo 行（大量的 █ 或 ╔ 等字符）
            const artCharCount = (line.match(/[█▀▄░▒▓╔╗╚╝╠╣╦╩╬═║]/g) || []).length;
            if (artCharCount > 5) {
                return false;
            }
            return true;
        });
        
        return filteredLines.join('\n').trim();
    }

    /**
     * 获取 CLI 版本信息
     */
    async getCliVersion(): Promise<string> {
        try {
            const result = await this.runCommand(['version']);
            if (result.success) {
                // 清理 ANSI 转义码
                const cleanOutput = this.stripAnsi(result.output.trim());
                // 只返回版本号部分
                const versionMatch = cleanOutput.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    return `v${versionMatch[1]}`;
                }
                return cleanOutput.split('\n')[0] || 'Available';
            }
            return 'Available';
        } catch (error) {
            return 'Not available';
        }
    }

    /**
     * 检查目录是否为空
     */
    async checkDirectoryEmpty(dirPath?: string): Promise<{ isEmpty: boolean; itemCount: number }> {
        const targetPath = dirPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!targetPath) {
            return { isEmpty: true, itemCount: 0 };
        }

        try {
            const fs = require('fs').promises;
            const items = await fs.readdir(targetPath);
            return { isEmpty: items.length === 0, itemCount: items.length };
        } catch {
            return { isEmpty: true, itemCount: 0 };
        }
    }

    /**
     * 初始化项目 - 直接执行，返回结果（不使用终端）
     */
    async initProject(projectName?: string, options: {
        ai?: string;
        here?: boolean;
        force?: boolean;
        noGit?: boolean;
        script?: string;
        debug?: boolean;
    } = {}): Promise<CliCommandResult> {
        const args = ['init'];
        
        if (projectName && !options.here) {
            args.push(projectName);
        } else if (options.here) {
            args.push('--here');
        } else {
            args.push('.');
        }

        if (options.ai) {
            args.push('--ai', options.ai);
        }

        if (options.script) {
            args.push('--script', options.script);
        }

        // 只有明确指定 force 时才添加 --force
        if (options.force) {
            args.push('--force');
        }

        if (options.noGit) {
            args.push('--no-git');
        }

        if (options.debug) {
            args.push('--debug');
        }

        // 跳过 AI 代理工具检查（因为我们是在 VS Code 扩展中运行）
        args.push('--ignore-agent-tools');

        logger.info(`Executing init command: specify-cn ${args.join(' ')}`);
        const result = await this.runCommand(args);
        
        // 清理输出中的 ANSI 转义码
        result.output = this.stripAnsi(result.output);
        if (result.error) {
            result.error = this.stripAnsi(result.error);
        }
        
        if (result.success) {
            logger.info(`Project initialized successfully`);
            // 验证初始化是否成功创建了必要的文件
            await this.verifyInitialization();
        } else {
            logger.error(`Project initialization failed: ${result.error}`);
        }
        
        return result;
    }

    /**
     * 验证项目初始化是否成功
     */
    private async verifyInitialization(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        const requiredPaths = [
            path.join(workspaceRoot, '.specify'),
            path.join(workspaceRoot, '.specify', 'templates'),
            path.join(workspaceRoot, '.specify', 'templates', 'commands'),
            path.join(workspaceRoot, '.specify', 'memory'),
            path.join(workspaceRoot, '.specify', 'scripts')
        ];

        for (const requiredPath of requiredPaths) {
            if (!(await this.pathExists(requiredPath))) {
                logger.warn(`Missing required path after initialization: ${requiredPath}`);
            }
        }
    }

    /**
     * 检查系统工具 - 直接执行，返回结果
     */
    async checkSystemTools(): Promise<CliCommandResult> {
        logger.info('Executing check command');
        return this.runCommand(['check']);
    }

    /**
     * 获取版本信息 - 直接执行，返回结果
     */
    async getVersion(): Promise<CliCommandResult> {
        logger.info('Executing version command');
        return this.runCommand(['version']);
    }

    /**
     * 检查项目状态（带缓存和超时）
     */
    async getProjectStatus(): Promise<ProjectStatus> {
        // 检查缓存
        if (this.statusCache && (Date.now() - this.statusCache.timestamp) < this.CACHE_DURATION) {
            return this.statusCache.status;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        
        if (!workspaceRoot) {
            const status: ProjectStatus = {
                isInitialized: false,
                hasConstitution: false,
                hasSpecification: false,
                hasPlan: false,
                hasTasks: false,
                workspaceRoot: ''
            };
            this.statusCache = { status, timestamp: Date.now() };
            return status;
        }

        try {
            // 使用Promise.race添加超时
            const statusPromise = this.getProjectStatusInternal(workspaceRoot);
            const timeoutPromise = new Promise<ProjectStatus>((_, reject) => {
                setTimeout(() => reject(new Error('Status check timeout')), 3000);
            });

            const status = await Promise.race([statusPromise, timeoutPromise]);
            
            // 缓存结果
            this.statusCache = { status, timestamp: Date.now() };
            return status;
        } catch (error) {
            logger.warn(`Error checking project status: ${error}`);
            
            // 返回默认状态并缓存
            const defaultStatus: ProjectStatus = {
                isInitialized: false,
                hasConstitution: false,
                hasSpecification: false,
                hasPlan: false,
                hasTasks: false,
                workspaceRoot
            };
            this.statusCache = { status: defaultStatus, timestamp: Date.now() };
            return defaultStatus;
        }
    }

    /**
     * 内部项目状态检查方法
     */
    private async getProjectStatusInternal(workspaceRoot: string): Promise<ProjectStatus> {
        const specifyDir = path.join(workspaceRoot, '.specify');
        const memoryDir = path.join(specifyDir, 'memory');
        const specsDir = path.join(specifyDir, 'specs');
        const templatesDir = path.join(specifyDir, 'templates');
        const commandsDir = path.join(templatesDir, 'commands');

        // 快速检查关键目录
        const [hasSpecifyDir, hasTemplatesDir, hasCommandsDir, hasMemoryDir] = await Promise.all([
            this.pathExists(specifyDir),
            this.pathExists(templatesDir),
            this.pathExists(commandsDir),
            this.pathExists(memoryDir)
        ]);
        
        const isInitialized = hasSpecifyDir && hasTemplatesDir && hasCommandsDir && hasMemoryDir;
        
        // 如果未初始化，直接返回
        if (!isInitialized) {
            return {
                isInitialized: false,
                hasConstitution: false,
                hasSpecification: false,
                hasPlan: false,
                hasTasks: false,
                workspaceRoot
            };
        }

        // 检查宪章文件（简化检查）
        const constitutionPath = path.join(memoryDir, 'constitution.md');
        let hasConstitution = false;
        try {
            if (await this.pathExists(constitutionPath)) {
                const fs = require('fs').promises;
                const stats = await fs.stat(constitutionPath);
                // 简单检查：如果文件大于100字节，认为已经生成
                hasConstitution = stats.size > 100;
            }
        } catch (error) {
            // 忽略错误，继续检查其他状态
        }
        
        // 简化其他文件检查
        let hasSpecification = false;
        let hasPlan = false;
        let hasTasks = false;

        try {
            const specsDirExists = await this.pathExists(specsDir);
            if (specsDirExists) {
                const fs = require('fs').promises;
                const specDirs = await fs.readdir(specsDir);
                
                // 只检查第一个规范目录
                if (specDirs.length > 0) {
                    const firstSpecDir = specDirs[0];
                    const specPath = path.join(specsDir, firstSpecDir);
                    
                    const [specExists, planExists, tasksExists] = await Promise.all([
                        this.pathExists(path.join(specPath, 'spec.md')),
                        this.pathExists(path.join(specPath, 'plan.md')),
                        this.pathExists(path.join(specPath, 'tasks.md'))
                    ]);
                    
                    hasSpecification = specExists;
                    hasPlan = planExists;
                    hasTasks = tasksExists;
                }
            }
        } catch (error) {
            // 忽略错误，使用默认值
        }

        return {
            isInitialized,
            hasConstitution,
            hasSpecification,
            hasPlan,
            hasTasks,
            workspaceRoot
        };
    }

    /**
     * 执行命令并返回输出（用于在聊天界面显示）
     */
    async executeCommand(args: string[]): Promise<CliCommandResult> {
        logger.info(`Executing command: specify-cn ${args.join(' ')}`);
        return await this.runCommand(args);
    }

    /**
     * 使用指定路径运行命令（带超时）
     */
    private async runCommandWithPath(cliPath: string, args: string[], cwd?: string, timeout: number = 120000): Promise<CliCommandResult> {
        return new Promise((resolve) => {
            const workingDir = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            
            logger.info(`Running command: ${cliPath} ${args.join(' ')} in ${workingDir}`);

            // 设置环境变量，确保常用路径在 PATH 中
            const env = { ...process.env };
            if (process.platform === 'win32') {
                const userProfile = process.env.USERPROFILE;
                const appData = process.env.APPDATA;
                const localAppData = process.env.LOCALAPPDATA;
                
                const additionalPaths = [
                    userProfile ? `${userProfile}\\.local\\bin` : '',
                    userProfile ? `${userProfile}\\AppData\\Local\\Programs\\claude-code` : '',
                    userProfile ? `${userProfile}\\AppData\\Roaming\\npm` : '',
                    appData ? `${appData}\\npm` : '',
                    localAppData ? `${localAppData}\\Programs\\Python\\Python311\\Scripts` : '',
                    localAppData ? `${localAppData}\\Programs\\Python\\Python312\\Scripts` : '',
                    'C:\\Program Files\\nodejs',
                    'C:\\Program Files (x86)\\nodejs',
                ].filter(Boolean);
                
                env.PATH = `${additionalPaths.join(';')};${env.PATH || ''}`;
            } else {
                const homeDir = process.env.HOME;
                const additionalPaths = [
                    homeDir ? `${homeDir}/.local/bin` : '',
                    homeDir ? `${homeDir}/.npm-global/bin` : '',
                    '/usr/local/bin',
                    '/opt/homebrew/bin',
                ].filter(Boolean);
                
                env.PATH = `${additionalPaths.join(':')}:${env.PATH || ''}`;
            }

            let isResolved = false;
            let stdout = '';
            let stderr = '';

            const child = spawn(cliPath, args, {
                cwd: workingDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                env: env
            });

            // 设置超时
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    child.kill();
                    logger.warn(`Command timed out after ${timeout}ms: ${cliPath} ${args.join(' ')}`);
                    resolve({
                        success: false,
                        output: stdout,
                        error: `命令执行超时（${timeout / 1000}秒）。可能原因：\n1. 网络连接问题\n2. GitHub API 限制\n3. CLI 未正确安装`,
                        exitCode: -1
                    });
                }
            }, timeout);

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    
                    const success = code === 0;
                    const result: CliCommandResult = {
                        success,
                        output: stdout,
                        error: stderr,
                        exitCode: code || 0
                    };

                    resolve(result);
                }
            });

            child.on('error', (error) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    
                    logger.error(`Command spawn error: ${error}`);
                    resolve({
                        success: false,
                        output: '',
                        error: error.message,
                        exitCode: -1
                    });
                }
            });
        });
    }

    /**
     * 运行 CLI 命令的通用方法
     */
    private async runCommand(args: string[], cwd?: string): Promise<CliCommandResult> {
        const cliPath = await this.findCliPath();
        return this.runCommandWithPath(cliPath, args, cwd);
    }

    /**
     * 检查路径是否存在
     */
    private async pathExists(filePath: string): Promise<boolean> {
        try {
            const fs = require('fs').promises;
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 创建项目宪章（本地创建，不依赖 CLI）
     */
    async createConstitution(description: string): Promise<CliCommandResult> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return {
                success: false,
                output: '',
                error: 'No workspace folder found'
            };
        }

        try {
            const fs = require('fs').promises;
            const memoryDir = path.join(workspaceRoot, '.specify', 'memory');
            const constitutionPath = path.join(memoryDir, 'constitution.md');

            await fs.mkdir(memoryDir, { recursive: true });

            const constitutionContent = `# 项目宪章

## 项目描述
${description}

## 开发原则

### 代码质量
- 编写清晰、可维护的代码
- 遵循一致的编码规范
- 进行充分的代码审查

### 测试标准
- 编写全面的单元测试
- 确保测试覆盖率达到合理水平
- 进行集成测试和端到端测试

### 用户体验一致性
- 保持界面设计的一致性
- 优化用户交互流程
- 确保可访问性标准

### 性能要求
- 优化应用程序性能
- 监控和分析性能指标
- 及时解决性能瓶颈

---
*此宪章将指导项目的所有技术决策和实施选择*
`;

            await fs.writeFile(constitutionPath, constitutionContent, 'utf8');

            return {
                success: true,
                output: `项目宪章已创建: ${constitutionPath}`,
                error: undefined
            };
        } catch (error) {
            return {
                success: false,
                output: '',
                error: `创建宪章失败: ${error}`
            };
        }
    }

    // 注意：斜杠命令（如 /speckit.constitution）是给 AI 代理的提示，不是 CLI 命令
    // CLI 只支持: init, check, version
    // 斜杠命令通过 aiAgentService.executeInTerminal() 发送到 AI 代理执行
}

// 单例实例
export const specKitCliService = new SpecKitCliService();
