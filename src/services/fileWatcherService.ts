import * as vscode from 'vscode';
import * as path from 'path';
import { ErrorHandler } from '../utils/errorHandler';

export interface FileChangeEvent {
    type: 'created' | 'changed' | 'deleted';
    uri: vscode.Uri;
    relativePath: string;
}

export interface FileWatcherOptions {
    patterns?: string[];
    ignore?: string[];
    debounceMs?: number;
}

export class FileWatcherService {
    private watchers: vscode.FileSystemWatcher[] = [];
    private disposables: vscode.Disposable[] = [];
    private workspaceRoot: string | undefined;
    private changeEventEmitter = new vscode.EventEmitter<FileChangeEvent>();
    private debounceTimer: NodeJS.Timeout | undefined;
    private pendingChanges: Map<string, FileChangeEvent> = new Map();

    public readonly onDidChange = this.changeEventEmitter.event;

    constructor(private options: FileWatcherOptions = {}) {
        this.options = {
            patterns: options.patterns || ['**/*'],
            ignore: options.ignore || [
                '**/.git/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**'
            ],
            debounceMs: options.debounceMs || 300,
            ...options
        };

        this.initialize();
    }

    /**
     * Initialize the file watcher
     */
    private async initialize(): Promise<void> {
        // Get workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            ErrorHandler.info('No workspace folder found');
            return;
        }

        this.workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Watch for workspace changes
        const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.restart();
        });

        this.disposables.push(workspaceWatcher);

        // Check if we should start watching
        const config = vscode.workspace.getConfiguration('spec-kit');
        if (config.get<boolean>('autoRefresh', true)) {
            await this.watchSpecifyDirectory();
        }
    }

    /**
     * Watch .specify directory
     */
    public async watchSpecifyDirectory(): Promise<void> {
        if (!this.workspaceRoot) {
            ErrorHandler.warn('No workspace root available for watching');
            return;
        }

        const specifyPath = path.join(this.workspaceRoot, '.specify');

        // Check if .specify directory exists
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(specifyPath));
        } catch {
            ErrorHandler.debug('.specify directory does not exist, watching for creation');
            await this.watchForSpecifyCreation();
            return;
        }

        ErrorHandler.debug(`Watching .specify directory: ${specifyPath}`);

        // Create watchers for different file patterns
        const patterns = [
            '**/.specify/**',
            '**/.claude/commands/**',
            '**/.gemini/commands/**',
            '**/.cursor/commands/**',
            '**/.github/agents/**',
            '**/.qwen/commands/**',
            '**/memory/constitution.md'
        ];

        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(this.workspaceRoot, pattern)
            );

            // Handle file creation
            watcher.onDidCreate(uri => this.handleFileChange('created', uri));

            // Handle file changes
            watcher.onDidChange(uri => this.handleFileChange('changed', uri));

            // Handle file deletion
            watcher.onDidDelete(uri => this.handleFileChange('deleted', uri));

            this.watchers.push(watcher);
        }

        ErrorHandler.info(`Started watching Spec Kit files in ${specifyPath}`);
    }

    /**
     * Watch for .specify directory creation
     */
    private async watchForSpecifyCreation(): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        const parentWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '.specify')
        );

        parentWatcher.onDidCreate(async (uri) => {
            ErrorHandler.info('Detected .specify directory creation');
            parentWatcher.dispose();
            await this.watchSpecifyDirectory();

            // Notify about the new Spec Kit project
            this.changeEventEmitter.fire({
                type: 'created',
                uri: uri,
                relativePath: '.specify'
            });
        });

        this.watchers.push(parentWatcher);
    }

    /**
     * Handle file system changes
     */
    private handleFileChange(type: FileChangeEvent['type'], uri: vscode.Uri): void {
        if (!this.workspaceRoot) {
            return;
        }

        // Get relative path from workspace root
        const relativePath = path.relative(this.workspaceRoot, uri.fsPath);

        // Check if file should be ignored
        if (this.shouldIgnore(relativePath)) {
            return;
        }

        const change: FileChangeEvent = {
            type,
            uri,
            relativePath
        };

        // Debounce rapid changes
        this.pendingChanges.set(relativePath, change);
        this.scheduleDebouncedEmit();
    }

    /**
     * Check if file should be ignored
     */
    private shouldIgnore(relativePath: string): boolean {
        if (!this.options.ignore) {
            return false;
        }

        return this.options.ignore.some(pattern => {
            // Simple glob matching
            const regex = new RegExp(
                pattern
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^/]*')
                    .replace(/\?/g, '[^/]')
            );
            return regex.test(relativePath);
        });
    }

    /**
     * Schedule debounced emission of change events
     */
    private scheduleDebouncedEmit(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.emitPendingChanges();
        }, this.options.debounceMs);
    }

    /**
     * Emit all pending changes
     */
    private emitPendingChanges(): void {
        if (this.pendingChanges.size === 0) {
            return;
        }

        const changes = Array.from(this.pendingChanges.values());
        this.pendingChanges.clear();

        ErrorHandler.debug(`Emitting ${changes.length} file change events`);

        changes.forEach(change => {
            this.changeEventEmitter.fire(change);
        });
    }

    /**
     * Restart the file watcher
     */
    public async restart(): Promise<void> {
        this.dispose();
        await this.initialize();
    }

    /**
     * Check if a file is a Spec Kit related file
     */
    public isSpecKitFile(uri: vscode.Uri): boolean {
        if (!this.workspaceRoot) {
            return false;
        }

        const relativePath = path.relative(this.workspaceRoot, uri.fsPath);

        // Check various Spec Kit patterns
        const specKitPatterns = [
            /^\.specify\//,
            /^memory\/constitution\.md$/,
            /^\.claude\/commands\//,
            /^\.gemini\/commands\//,
            /^\.cursor\/commands\//,
            /^\.github\/agents\//,
            /^\.qwen\/commands\//
        ];

        return specKitPatterns.some(pattern => pattern.test(relativePath));
    }

    /**
     * Get the type of Spec Kit file
     */
    public getSpecKitFileType(uri: vscode.Uri): string | null {
        if (!this.workspaceRoot) {
            return null;
        }

        const relativePath = path.relative(this.workspaceRoot, uri.fsPath);

        if (relativePath.startsWith('.specify/')) {
            if (relativePath.includes('constitution')) {
                return 'constitution';
            } else if (relativePath.includes('specification')) {
                return 'specification';
            } else if (relativePath.includes('plan')) {
                return 'plan';
            } else if (relativePath.includes('tasks')) {
                return 'tasks';
            }
            return 'specify-config';
        }

        if (relativePath.startsWith('memory/') && relativePath.includes('constitution')) {
            return 'memory-constitution';
        }

        const agentPatterns = [
            { pattern: /^\.claude\/commands\//, type: 'claude' },
            { pattern: /^\.gemini\/commands\//, type: 'gemini' },
            { pattern: /^\.cursor\/commands\//, type: 'cursor' },
            { pattern: /^\.github\/agents\//, type: 'copilot' },
            { pattern: /^\.qwen\/commands\//, type: 'qwen' }
        ];

        for (const { pattern, type } of agentPatterns) {
            if (pattern.test(relativePath)) {
                return type;
            }
        }

        return null;
    }

    /**
     * Force a refresh of the watcher
     */
    public async refresh(): Promise<void> {
        if (this.workspaceRoot) {
            await this.watchSpecifyDirectory();
        }
    }

    /**
     * Check if watcher is active
     */
    public isActive(): boolean {
        return this.watchers.length > 0;
    }

    /**
     * Dispose all watchers
     */
    public dispose(): void {
        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }

        // Clear pending changes
        this.pendingChanges.clear();

        // Dispose all watchers
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers = [];

        // Dispose all disposables
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];

        // Dispose event emitter
        this.changeEventEmitter.dispose();

        ErrorHandler.debug('FileWatcherService disposed');
    }
}

/**
 * Singleton instance for global access
 */
let fileWatcherInstance: FileWatcherService | undefined;

export function getFileWatcherService(options?: FileWatcherOptions): FileWatcherService {
    if (!fileWatcherInstance) {
        fileWatcherInstance = new FileWatcherService(options);
    }
    return fileWatcherInstance;
}

export function disposeFileWatcherService(): void {
    if (fileWatcherInstance) {
        fileWatcherInstance.dispose();
        fileWatcherInstance = undefined;
    }
}