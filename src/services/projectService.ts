import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export class ProjectService {
    private static instance: ProjectService;

    private constructor() { }

    public static getInstance(): ProjectService {
        if (!ProjectService.instance) {
            ProjectService.instance = new ProjectService();
        }
        return ProjectService.instance;
    }

    /**
     * Get workspace root path
     */
    public getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder opened');
        }
        return workspaceFolders[0].uri.fsPath;
    }

    /**
     * Check if project is initialized
     */
    public async isProjectInitialized(): Promise<boolean> {
        try {
            const root = this.getWorkspaceRoot();
            const specifyDir = vscode.Uri.joinPath(vscode.Uri.file(root), '.specify');
            await vscode.workspace.fs.stat(specifyDir);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get specification file path
     */
    public async getSpecificationPath(): Promise<string | null> {
        try {
            const root = this.getWorkspaceRoot();
            const specDir = vscode.Uri.joinPath(vscode.Uri.file(root), '.specify', 'spec.md');
            await vscode.workspace.fs.stat(specDir);
            return specDir.fsPath;
        } catch {
            return null;
        }
    }

    /**
     * Get plan file path
     */
    public async getPlanPath(): Promise<string | null> {
        try {
            const root = this.getWorkspaceRoot();
            const planDir = vscode.Uri.joinPath(vscode.Uri.file(root), '.specify', 'plan.md');
            await vscode.workspace.fs.stat(planDir);
            return planDir.fsPath;
        } catch {
            return null;
        }
    }

    /**
     * Get tasks file path
     */
    public async getTasksPath(): Promise<string | null> {
        try {
            const root = this.getWorkspaceRoot();
            const tasksDir = vscode.Uri.joinPath(vscode.Uri.file(root), '.specify', 'tasks.md');
            await vscode.workspace.fs.stat(tasksDir);
            return tasksDir.fsPath;
        } catch {
            return null;
        }
    }

    /**
     * Get constitution file path
     */
    public async getConstitutionPath(): Promise<string | null> {
        try {
            const root = this.getWorkspaceRoot();
            const constitutionDir = vscode.Uri.joinPath(
                vscode.Uri.file(root),
                '.specify',
                'constitution.md'
            );
            await vscode.workspace.fs.stat(constitutionDir);
            return constitutionDir.fsPath;
        } catch {
            return null;
        }
    }

    /**
     * Open file in editor
     */
    public async openFile(filePath: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to open file: ${msg}`);
            throw error;
        }
    }

    /**
     * Get AI assistant from config
     */
    public getDefaultAiAssistant(): string {
        const config = vscode.workspace.getConfiguration('spec-kit');
        return config.get<string>('defaultAiAssistant', 'claude');
    }

    /**
     * Get GitHub token from environment
     */
    public getGithubToken(): string | undefined {
        return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    }
}

export default ProjectService.getInstance();
