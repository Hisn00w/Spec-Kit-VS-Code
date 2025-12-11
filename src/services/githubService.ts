import * as vscode from 'vscode';

interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

interface GitRemote {
    name: string;
    fetchUrl: string;
}

interface GitExtension {
    getAPI(version: number): GitAPI;
}

interface GitAPI {
    repositories: GitRepository[];
}

interface GitRepository {
    rootUri: vscode.Uri;
    getRemotes(): Promise<GitRemote[]>;
}
import { ErrorHandler } from '../utils/errorHandler';

export interface GitHubTask {
    title: string;
    description: string;
    labels?: string[];
    assignees?: string[];
    milestone?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    estimatedHours?: number;
    dependencies?: string[];
}

export interface GitHubIssue {
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    labels: { name: string; color: string }[];
    assignees: { login: string }[];
    milestone?: { title: string };
    html_url: string;
    created_at: string;
    updated_at: string;
}

export interface GitHubRepository {
    owner: string;
    repo: string;
    defaultBranch: string;
}

export class GitHubService {
    private static readonly GITHUB_API_BASE = 'https://api.github.com';

    private static async fetchWithTimeout(url: string, options?: FetchOptions, timeout: number = 30000): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal as AbortSignal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Store GitHub token in secure storage
     */
    public static async storeToken(token: string): Promise<void> {
        const secretStorage = vscode.workspace.getConfiguration('spec-kit');
        await secretStorage.update('githubToken', token, vscode.ConfigurationTarget.Global);
        ErrorHandler.info('GitHub token stored successfully');
    }

    /**
     * Get GitHub token from configuration
     */
    public static getToken(): string | undefined {
        const config = vscode.workspace.getConfiguration('spec-kit');
        return config.get<string>('githubToken');
    }

    /**
     * Validate GitHub token
     */
    public static async validateToken(token: string): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(`${this.GITHUB_API_BASE}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Spec-Kit-VSCode'
                }
            });

            return response.ok;
        } catch (error) {
            ErrorHandler.debug(`Token validation failed: ${error}`);
            return false;
        }
    }

    /**
     * Get current GitHub repository info
     */
    public static async getCurrentRepository(): Promise<GitHubRepository | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return undefined;
        }

        try {
            // Check for git remote
            const gitExtension = vscode.extensions.getExtension('vscode.git') as vscode.Extension<GitExtension> | undefined;
            if (!gitExtension) {
                ErrorHandler.warn('Git extension not found');
                return undefined;
            }

            const git = gitExtension.exports.getAPI(1);
            const repository = git.repositories.find((repo: GitRepository) =>
                repo.rootUri.fsPath === workspaceFolders[0].uri.fsPath
            );

            if (!repository) {
                ErrorHandler.warn('No git repository found');
                return undefined;
            }

            // Get remote info
            const remotes = await repository.getRemotes();
            const originRemote = remotes.find((remote: GitRemote) => remote.name === 'origin');

            if (!originRemote || !originRemote.fetchUrl) {
                ErrorHandler.warn('No origin remote found');
                return undefined;
            }

            // Parse GitHub URL
            const url = originRemote.fetchUrl;
            const match = url.match(/github\.com[/ :]([^/]+)\/([^/]+?)(\.git)?$/);

            if (!match) {
                ErrorHandler.warn('Not a GitHub repository');
                return undefined;
            }

            const owner = match[1];
            const repo = match[2].replace('.git', '');

            // Get default branch
            const defaultBranch = await this.getDefaultBranch(owner, repo);

            return { owner, repo, defaultBranch };

        } catch (error) {
            ErrorHandler.warn(`Failed to get repository info: ${error}`);
            return undefined;
        }
    }

    /**
     * Get default branch for repository
     */
    private static async getDefaultBranch(owner: string, repo: string): Promise<string> {
        try {
            const token = this.getToken();
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Spec-Kit-VSCode'
            };

            if (token) {
                headers['Authorization'] = `token ${token}`;
            }

            const response = await this.fetchWithTimeout(`${this.GITHUB_API_BASE}/repos/${owner}/${repo}`, {
                headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch repository: ${response.statusText}`);
            }

            const data = await response.json() as { default_branch?: string };
            return data.default_branch || 'main';
        } catch (error) {
            ErrorHandler.debug(`Failed to get default branch: ${error}`);
            return 'main';
        }
    }

    /**
     * Export tasks to GitHub Issues
     */
    public static async exportTasksToIssues(
        tasks: GitHubTask[],
        repository?: GitHubRepository
    ): Promise<GitHubIssue[]> {
        const token = this.getToken();
        if (!token) {
            const result = await vscode.window.showErrorMessage(
                '需要 GitHub token 来创建 Issues',
                '配置 Token',
                '取消'
            );

            if (result === '配置 Token') {
                await this.promptForToken();
            }

            throw new Error('GitHub token not configured');
        }

        if (!repository) {
            repository = await this.getCurrentRepository();
            if (!repository) {
                throw new Error('无法确定 GitHub 仓库信息');
            }
        }

        const issues: GitHubIssue[] = [];

        for (const task of tasks) {
            try {
                const issue = await this.createIssue(repository, task);
                issues.push(issue);
                ErrorHandler.info(`Created issue: ${issue.title} (#${issue.number})`);
            } catch (error) {
                ErrorHandler.warn(`Failed to create issue "${task.title}": ${error}`);
            }
        }

        return issues;
    }

    /**
     * Create a single GitHub Issue
     */
    private static async createIssue(
        repository: GitHubRepository,
        task: GitHubTask
    ): Promise<GitHubIssue> {
        const token = this.getToken();
        if (!token) {
            throw new Error('GitHub token not available');
        }

        const issueBody = this.formatIssueBody(task);
        const labels = this.formatLabels(task);

        const response = await this.fetchWithTimeout(`${this.GITHUB_API_BASE}/repos/${repository.owner}/${repository.repo}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'Spec-Kit-VSCode'
            },
            body: JSON.stringify({
                title: task.title,
                body: issueBody,
                labels,
                assignees: task.assignees || []
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as { message?: string };
            throw new Error(`Failed to create issue: ${errorData.message || response.statusText}`);
        }

        return await response.json() as GitHubIssue;
    }

    /**
     * Format task as GitHub issue body
     */
    private static formatIssueBody(task: GitHubTask): string {
        let body = task.description;

        // Add metadata
        const metadata: string[] = [];

        if (task.priority) {
            metadata.push(`**优先级**: ${this.getPriorityEmoji(task.priority)} ${task.priority.toUpperCase()}`);
        }

        if (task.estimatedHours) {
            metadata.push(`**预估工时**: ${task.estimatedHours} 小时`);
        }

        if (task.dependencies && task.dependencies.length > 0) {
            metadata.push(`**依赖**: ${task.dependencies.map(dep => `#${dep}`).join(', ')}`);
        }

        if (metadata.length > 0) {
            body += '\n\n---\n\n' + metadata.join('\n');
        }

        // Add Spec Kit footer
        body += '\n\n---\n\n*此 Issue 由 Spec Kit VS Code 扩展自动生成*';

        return body;
    }

    /**
     * Format labels for GitHub issue
     */
    private static formatLabels(task: GitHubTask): string[] {
        const labels: string[] = [];

        // Add priority labels
        if (task.priority) {
            labels.push(`priority: ${task.priority}`);
        }

        // Add spec-kit label
        labels.push('spec-kit');

        // Add custom labels
        if (task.labels) {
            labels.push(...task.labels);
        }

        return labels;
    }

    /**
     * Get emoji for priority level
     */
    private static getPriorityEmoji(priority: string): string {
        switch (priority.toLowerCase()) {
            case 'critical':
                return '🔴';
            case 'high':
                return '🟠';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            default:
                return '⚪';
        }
    }

    /**
     * Prompt user for GitHub token
     */
    public static async promptForToken(): Promise<boolean> {
        const token = await vscode.window.showInputBox({
            prompt: '请输入 GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_...',
            validateInput: async (value) => {
                if (!value || value.trim() === '') {
                    return 'Token 不能为空';
                }

                if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
                    return '无效的 GitHub token 格式';
                }

                // Validate token
                const isValid = await this.validateToken(value.trim());
                if (!isValid) {
                    return 'Token 验证失败，请检查 token 是否正确';
                }

                return null;
            }
        });

        if (token) {
            await this.storeToken(token.trim());
            return true;
        }

        return false;
    }

    /**
     * Get existing issues from repository
     */
    public static async getIssues(
        repository?: GitHubRepository,
        state: 'open' | 'closed' | 'all' = 'open',
        labels?: string[]
    ): Promise<GitHubIssue[]> {
        const token = this.getToken();
        if (!token) {
            throw new Error('GitHub token not configured');
        }

        if (!repository) {
            repository = await this.getCurrentRepository();
            if (!repository) {
                throw new Error('无法确定 GitHub 仓库信息');
            }
        }

        const params = new URLSearchParams({
            state,
            per_page: '100'
        });

        if (labels && labels.length > 0) {
            params.append('labels', labels.join(','));
        }

        const response = await this.fetchWithTimeout(
            `${this.GITHUB_API_BASE}/repos/${repository.owner}/${repository.repo}/issues?${params}`,
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Spec-Kit-VSCode'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch issues: ${response.statusText}`);
        }

        return await response.json() as GitHubIssue[];
    }

    /**
     * Check if repository has GitHub Actions workflow file
     */
    public static async hasGitHubActionsWorkflow(repository?: GitHubRepository): Promise<boolean> {
        if (!repository) {
            repository = await this.getCurrentRepository();
            if (!repository) {
                return false;
            }
        }

        try {
            const token = this.getToken();
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Spec-Kit-VSCode'
            };

            if (token) {
                headers['Authorization'] = `token ${token}`;
            }

            const response = await this.fetchWithTimeout(
                `${this.GITHUB_API_BASE}/repos/${repository.owner}/${repository.repo}/contents/.github/workflows`,
                { headers }
            );

            return response.ok;
        } catch {
            return false;
        }
    }
}