import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as which from 'which';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface CliDetectionResult {
    found: boolean;
    path?: string;
    version?: string;
    error?: string;
}

export class SpecifyCliService {
    private static instance: SpecifyCliService;
    private cliPath: string | null = null;
    private detectionCache: CliDetectionResult | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    private constructor() { }

    public static getInstance(): SpecifyCliService {
        if (!SpecifyCliService.instance) {
            SpecifyCliService.instance = new SpecifyCliService();
        }
        return SpecifyCliService.instance;
    }

    /**
     * Detect specify-cn CLI installation
     */
    public async detectCli(forceRefresh: boolean = false): Promise<CliDetectionResult> {
        // Return cached result if still valid
        if (!forceRefresh && this.detectionCache && Date.now() < this.cacheExpiry) {
            return this.detectionCache;
        }

        const config = vscode.workspace.getConfiguration('spec-kit');
        const customPath = config.get<string>('cliPath', '');

        try {
            let cliPath: string | null = null;

            // 1. Try custom path if configured
            if (customPath && customPath.trim()) {
                if (await this.fileExists(customPath)) {
                    cliPath = customPath;
                    logger.info(`Found specify-cn at custom path: ${customPath}`);
                } else {
                    logger.warn(`Custom CLI path not found: ${customPath}`);
                }
            }

            // 2. Try to find in PATH
            if (!cliPath) {
                cliPath = which.sync('specify-cn');
                if (cliPath) {
                    logger.info(`Found specify-cn in PATH: ${cliPath}`);
                }
            }

            // 3. If not found, return error
            if (!cliPath) {
                const result: CliDetectionResult = {
                    found: false,
                    error: 'specify-cn CLI not found in PATH. Please install it first.'
                };
                this.cacheResult(result);
                return result;
            }

            // Get version
            const version = await this.getCliVersion(cliPath);

            const result: CliDetectionResult = {
                found: true,
                path: cliPath,
                version: version
            };

            this.cliPath = cliPath;
            this.cacheResult(result);
            return result;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`CLI detection failed: ${errorMsg}`);
            const result: CliDetectionResult = {
                found: false,
                error: errorMsg
            };
            this.cacheResult(result);
            return result;
        }
    }

    /**
     * Get specify-cn version
     */
    private async getCliVersion(cliPath: string): Promise<string | undefined> {
        try {
            const output = await this.executeCommand(cliPath, ['--version'], {
                timeout: 5000
            });
            const match = output.match(/[\d.]+/);
            return match ? match[0] : 'unknown';
        } catch (error) {
            logger.warn(`Failed to get CLI version: ${error}`);
            return undefined;
        }
    }

    /**
     * Execute specify-cn command
     */
    public async executeCommand(
        cliPath: string,
        args: string[],
        options?: cp.ExecFileOptions
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('spec-kit');
            const timeout = config.get<number>('commandTimeout', 120) * 1000;

            const execOptions: cp.ExecFileOptions = {
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB
                ...options
            };

            const startTime = Date.now();
            logger.info(`Executing: ${cliPath} ${args.join(' ')}`);

            cp.execFile(cliPath, args, execOptions, (error, stdout, stderr) => {
                const duration = Date.now() - startTime;

                if (error) {
                    logger.error(`Command failed (${duration}ms): ${error.message}`);
                    if (stderr) {
                        logger.error(`stderr: ${stderr}`);
                    }
                    reject(error);
                } else {
                    logger.info(`Command succeeded (${duration}ms)`);
                    resolve(stdout as string);
                }
            });
        });
    }

    /**
     * Run specify-cn init command
     */
    public async runInit(
        projectPath: string,
        options: {
            aiAssistant?: string;
            githubToken?: string;
        } = {}
    ): Promise<string> {
        const detection = await this.detectCli();
        if (!detection.found || !detection.path) {
            throw new Error('specify-cn CLI not found');
        }

        const args = ['init', projectPath];

        if (options.aiAssistant) {
            args.push('--ai', options.aiAssistant);
        }

        if (options.githubToken) {
            args.push('--github-token', options.githubToken);
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return this.executeCommand(detection.path, args, {
            cwd: workspacePath
        });
    }

    /**
     * Run specify-cn specify command
     */
    public async runSpecify(options: { githubToken?: string } = {}): Promise<string> {
        const detection = await this.detectCli();
        if (!detection.found || !detection.path) {
            throw new Error('specify-cn CLI not found');
        }

        const args = ['specify'];

        if (options.githubToken) {
            args.push('--github-token', options.githubToken);
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return this.executeCommand(detection.path, args, {
            cwd: workspacePath
        });
    }

    /**
     * Run specify-cn plan command
     */
    public async runPlan(options: { githubToken?: string } = {}): Promise<string> {
        const detection = await this.detectCli();
        if (!detection.found || !detection.path) {
            throw new Error('specify-cn CLI not found');
        }

        const args = ['plan'];

        if (options.githubToken) {
            args.push('--github-token', options.githubToken);
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return this.executeCommand(detection.path, args, {
            cwd: workspacePath
        });
    }

    /**
     * Run specify-cn tasks command
     */
    public async runTasks(options: { githubToken?: string } = {}): Promise<string> {
        const detection = await this.detectCli();
        if (!detection.found || !detection.path) {
            throw new Error('specify-cn CLI not found');
        }

        const args = ['tasks'];

        if (options.githubToken) {
            args.push('--github-token', options.githubToken);
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return this.executeCommand(detection.path, args, {
            cwd: workspacePath
        });
    }

    /**
     * Get CLI path (after detection)
     */
    public getCliPath(): string | null {
        return this.cliPath;
    }

    /**
     * Clear cache to force re-detection
     */
    public clearCache(): void {
        this.detectionCache = null;
        this.cacheExpiry = 0;
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Cache detection result
     */
    private cacheResult(result: CliDetectionResult): void {
        this.detectionCache = result;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
    }
}

export default SpecifyCliService.getInstance();
