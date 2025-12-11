import * as vscode from 'vscode';
import projectService from '../services/projectService';
import { getLogger } from '../utils/logger';

const logger = getLogger();

export interface ExplorerItem {
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
    command?: vscode.Command;
    contextValue?: string;
    description?: string;
}

export class SpecKitExplorer implements vscode.TreeDataProvider<ExplorerItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined | null | void> =
        new vscode.EventEmitter<ExplorerItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined | null | void> =
        this._onDidChangeTreeData.event;
    private _watcher: vscode.FileSystemWatcher;

    constructor() {
        // Watch for file changes
        this._watcher = vscode.workspace.createFileSystemWatcher('**/.specify/**');
        this._watcher.onDidChange(() => this.refresh());
        this._watcher.onDidCreate(() => this.refresh());
        this._watcher.onDidDelete(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

    async getTreeItem(element: ExplorerItem): Promise<vscode.TreeItem> {
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);

        // Transfer all properties from ExplorerItem to TreeItem
        if (element.description) {
            treeItem.description = element.description;
        }

        if (element.iconPath) {
            treeItem.iconPath = element.iconPath;
        }

        if (element.command) {
            treeItem.command = element.command;
        }

        if (element.contextValue) {
            treeItem.contextValue = element.contextValue;
        }

        return treeItem;
    }

    async getChildren(element?: ExplorerItem): Promise<ExplorerItem[]> {
        try {
            if (!element) {
                // Root items
                return this.getRootItems();
            }
            return [];
        } catch (error) {
            logger.warn(`Error getting tree items: ${error}`);
            return [];
        }
    }

    private async getRootItems(): Promise<ExplorerItem[]> {
        const items: ExplorerItem[] = [];

        try {
            const isInitialized = await projectService.isProjectInitialized();

            if (!isInitialized) {
                items.push({
                    label: '项目未初始化',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    description: '点击以初始化',
                    command: {
                        title: '初始化',
                        command: 'spec-kit.init'
                    }
                });
                return items;
            }

            // 项目宪章
            const constitution = await projectService.getConstitutionPath();
            items.push({
                label: '📋 项目宪章',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                description: constitution ? '✓' : '○',
                command: constitution
                    ? {
                        title: '打开',
                        command: 'vscode.open',
                        arguments: [vscode.Uri.file(constitution)]
                    }
                    : undefined
            });

            // 规范
            const spec = await projectService.getSpecificationPath();
            items.push({
                label: '📝 规范',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                description: spec ? '✓' : '○',
                command: spec
                    ? {
                        title: '打开',
                        command: 'vscode.open',
                        arguments: [vscode.Uri.file(spec)]
                    }
                    : {
                        title: '生成',
                        command: 'spec-kit.specify'
                    }
            });

            // 计划
            const plan = await projectService.getPlanPath();
            items.push({
                label: '🗺️ 计划',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                description: plan ? '✓' : '○',
                command: plan
                    ? {
                        title: '打开',
                        command: 'vscode.open',
                        arguments: [vscode.Uri.file(plan)]
                    }
                    : {
                        title: '生成',
                        command: 'spec-kit.plan'
                    }
            });

            // 任务
            const tasks = await projectService.getTasksPath();
            items.push({
                label: '✓ 任务',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                description: tasks ? '✓' : '○',
                command: tasks
                    ? {
                        title: '打开',
                        command: 'vscode.open',
                        arguments: [vscode.Uri.file(tasks)]
                    }
                    : {
                        title: '生成',
                        command: 'spec-kit.tasks'
                    }
            });

            // 快速操作
            items.push({
                label: '⚙️ 设置',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    title: '打开设置',
                    command: 'workbench.action.openSettings',
                    arguments: ['spec-kit']
                }
            });

        } catch (error) {
            logger.warn(`加载树状图项时出错: ${error}`);
        }

        return items;
    }

    dispose(): void {
        this._watcher.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
