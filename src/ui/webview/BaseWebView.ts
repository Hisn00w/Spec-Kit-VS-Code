import * as vscode from 'vscode';

export interface WebViewMessage {
    command: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
}

export abstract class BaseWebView {
    protected _panel: vscode.WebviewPanel | undefined;
    protected _disposables: vscode.Disposable[] = [];
    protected _extensionUri: vscode.Uri;
    protected _title: string;

    constructor(
        extensionUri: vscode.Uri,
        title: string,
        viewType: string,
        showOptions?: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean }
    ) {
        this._extensionUri = extensionUri;
        this._title = title;

        // Create webview panel
        this._panel = vscode.window.createWebviewPanel(
            viewType,
            title,
            showOptions || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        // Set webview HTML
        this._panel.webview.html = this.getHtml();

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            this.onMessage.bind(this),
            undefined,
            this._disposables
        );

        // Handle panel disposal
        this._panel.onDidDispose(
            this.onDispose.bind(this),
            undefined,
            this._disposables
        );
    }

    /**
     * Get the HTML content for the webview
     */
    public getHtml(): string {
        const nonce = this.getNonce();
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${this.getWebviewUri('')}; script-src 'nonce-${nonce}'; img-src ${this.getWebviewUri('')} https:;">
                <title>${this._title}</title>
                <link href="${this.getWebviewUri('media/styles.css')}" rel="stylesheet">
                <style>
                    :root {
                        --vscode-font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
                        --vscode-font-size: var(--vscode-font-size, 13px);
                        --vscode-foreground: ${this.getColor(theme, 'foreground')};
                        --vscode-background: ${this.getColor(theme, 'background')};
                        --vscode-editor-background: ${this.getColor(theme, 'editor.background')};
                        --vscode-editor-foreground: ${this.getColor(theme, 'editor.foreground')};
                        --vscode-button-background: ${this.getColor(theme, 'button.background')};
                        --vscode-button-foreground: ${this.getColor(theme, 'button.foreground')};
                        --vscode-button-hoverBackground: ${this.getColor(theme, 'button.hoverBackground')};
                        --vscode-focusBorder: ${this.getColor(theme, 'focusBorder')};
                        --vscode-border: ${this.getColor(theme, 'border')};
                        --vscode-widget-background: ${this.getColor(theme, 'widget.background')};
                        --vscode-progressBar-background: ${this.getColor(theme, 'progressBar.background')};
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-background);
                        margin: 0;
                        padding: 20px;
                        line-height: 1.5;
                    }

                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }

                    .header {
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid var(--vscode-border);
                    }

                    .loading {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 200px;
                        font-size: 16px;
                    }

                    .error {
                        color: var(--vscode-errorForeground);
                        background-color: var(--vscode-inputValidation-errorBackground);
                        padding: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                    }

                    .button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: var(--vscode-font-size);
                    }

                    .button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    .progress {
                        width: 100%;
                        height: 4px;
                        background-color: var(--vscode-progressBar-background);
                        border-radius: 2px;
                        overflow: hidden;
                        margin: 10px 0;
                    }

                    .progress-bar {
                        height: 100%;
                        background-color: var(--vscode-button-background);
                        transition: width 0.3s ease;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${this._title}</h1>
                    </div>
                    <div id="content">
                        ${this.getBodyContent()}
                    </div>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();

                    // Send message to extension
                    function sendMessage(command, data) {
                        vscode.postMessage({
                            command: command,
                            data: data
                        });
                    }

                    // Listen for messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        handleWebviewMessage(message);
                    });

                    ${this.getScriptContent()}
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Get the body content for the webview
     * Override this method to provide custom content
     */
    protected abstract getBodyContent(): string;

    /**
     * Get the script content for the webview
     * Override this method to provide custom scripts
     */
    protected getScriptContent(): string {
        return '';
    }

    /**
     * Handle messages from the webview
     * Override this method to handle custom messages
     */
    protected abstract onMessage(message: WebViewMessage): void;

    /**
     * Send a message to the webview
     */
    protected sendMessage(message: WebViewMessage): void {
        if (this._panel) {
            this._panel.webview.postMessage(message);
        }
    }

    /**
     * Show the webview panel
     */
    public show(): void {
        if (this._panel) {
            this._panel.reveal();
        }
    }

    /**
     * Close the webview panel
     */
    public close(): void {
        if (this._panel) {
            this._panel.dispose();
        }
    }

    /**
     * Check if the webview is visible
     */
    public isVisible(): boolean {
        return this._panel?.visible || false;
    }

    /**
     * Handle panel disposal
     */
    protected onDispose(): void {
        this.dispose();
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        this._panel = undefined;
    }

    /**
     * Get a URI for a resource within the webview
     */
    protected getWebviewUri(path: string): string {
        if (!this._panel) {
            return '';
        }
        return this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, path)
        ).toString();
    }

    /**
     * Get a nonce for Content Security Policy
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Get VS Code color based on theme
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private getColor(_theme: string, _colorName: string): string {
        return '';
    }
}

/**
 * Handle messages in the webview (to be used in webview scripts)
 */
export function handleWebviewMessage(message: WebViewMessage): void {
    // This function will be overridden in specific webview implementations
    console.log('Received message:', message);
}