# Spec Kit VS Code Extension - 快速参考卡片

## 快速命令

```bash
# 进入项目目录
cd .spec-kit-vscode

# 构建（自动化）
./build.sh          # macOS/Linux
.\build.bat         # Windows

# 或手动构建
npm install
npm run esbuild
npm run package

# 调试
npm run esbuild-watch    # 监听文件变化
# 然后按 F5 在 VS Code 中调试

# 代码检查
npm run lint

# 本地测试
code --install-extension spec-kit-vscode-*.vsix

# 发布
npm run publish
```

## 文件导航

| 要做的事 | 编辑这个文件 |
|--------|------------|
| 添加新命令 | `src/commands/yourCommand.ts` + `package.json` |
| 修改侧边栏 | `src/ui/explorer.ts` |
| 修改配置项 | `package.json` (contributes.configuration) |
| 添加新设置 | `package.json` + `src/extension.ts` |
| 改进日志 | `src/utils/logger.ts` |
| 调整 UI 交互 | `src/utils/ui.ts` |
| 改进 CLI 集成 | `src/services/specifyCliService.ts` |

## VS Code 快捷键

| 操作 | 快捷键 |
|-----|--------|
| 打开命令面板 | `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac) |
| 打开终端 | `` Ctrl+` `` |
| 打开输出面板 | `Ctrl+Shift+U` |
| 运行/调试 | `F5` |
| 停止调试 | `Shift+F5` |

## 扩展命令列表

在 VS Code 中按 `Ctrl+Shift+P` 搜索：

- **Spec Kit: Initialize Project** - 初始化新项目
- **Spec Kit: Create Specification** - 生成规范
- **Spec Kit: Create Plan** - 生成计划
- **Spec Kit: Create Tasks** - 分解任务
- **Spec Kit: View Configuration** - 查看配置
- **Spec Kit: Check CLI Installation** - 检查 CLI

## 配置项设置

在 VS Code 设置中搜索 "spec-kit"：

```json
{
  "spec-kit.cliPath": "",              // 自定义 CLI 路径
  "spec-kit.autoDetectCli": true,      // 自动检测
  "spec-kit.debug": false,             // 调试日志
  "spec-kit.defaultAiAssistant": "claude",
  "spec-kit.showNotifications": true,
  "spec-kit.openResultsInNewTab": true,
  "spec-kit.commandTimeout": 120       // 秒
}
```

## 项目结构速览

```
src/
├── extension.ts           ← 主入口，在这里注册所有命令
├── services/
│   ├── specifyCliService.ts  ← CLI 检测和执行
│   └── projectService.ts     ← 文件和配置管理
├── commands/              ← 各个命令的实现
├── ui/
│   └── explorer.ts        ← 侧边栏视图
└── utils/
    ├── logger.ts          ← 日志系统
    └── ui.ts              ← UI 工具
```

## 常见任务

### 添加新命令

1. 创建 `src/commands/myCommand.ts`:
```typescript
export async function registerMyCommand(context: vscode.ExtensionContext) {
    const command = vscode.commands.registerCommand('spec-kit.myCommand', async () => {
        vscode.window.showInformationMessage('Hello!');
    });
    context.subscriptions.push(command);
}
```

2. 在 `src/extension.ts` 导入并调用:
```typescript
import { registerMyCommand } from './commands/myCommand';
// 在 activate 函数中:
await registerMyCommand(context);
```

3. 在 `package.json` 的 `contributes.commands` 添加:
```json
{
  "command": "spec-kit.myCommand",
  "title": "My Command",
  "category": "Spec Kit"
}
```

### 调试扩展

1. 在代码中添加日志：
```typescript
import { getLogger } from '../utils/logger';
const logger = getLogger();
logger.debug('Message');  // 需要启用 spec-kit.debug
logger.info('Message');
logger.warn('Message');
logger.error('Message');
```

2. 启用调试：
   - VS Code 设置 → `spec-kit.debug` → 启用
   - 或 Command Palette → Preferences: Open User Settings (JSON)
   - 添加: `"spec-kit.debug": true`

3. 查看输出：
   - View → Output (或 `Ctrl+Shift+U`)
   - 从下拉菜单选择 "Spec Kit"

### 处理错误

```typescript
try {
    await specifyCliService.detectCli();
} catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Operation failed: ${msg}`);
    vscode.window.showErrorMessage(`Failed: ${msg}`);
    logger.show();  // 显示输出面板
}
```

## 版本号格式

遵循 Semantic Versioning：
- **Patch** (0.1.**0** → 0.1.**1**): Bug 修复
- **Minor** (0.**1**.0 → 0.**2**.0): 新功能，向后兼容
- **Major** (**0**.1.0 → **1**.0.0): 重大变更

## 发布清单

发布前检查：
- [ ] `npm run lint` - 代码检查通过
- [ ] `npm run esbuild` - 构建成功
- [ ] 本地测试所有命令
- [ ] 更新 `CHANGELOG.md`
- [ ] 更新版本号
- [ ] `README.md` 更新
- [ ] `package.json` 中有 publisher ID

## 常见问题速解

| 问题 | 解决方案 |
|-----|--------|
| 构建失败 | `rm -rf node_modules dist && npm install && npm run esbuild` |
| CLI 未找到 | `pip install specify-cn-cli` 或设置 `spec-kit.cliPath` |
| 调试不工作 | 确保已执行 `npm run esbuild` 然后按 F5 |
| 命令不显示 | 在 `package.json` 的 `contributes.commands` 中声明 |

## 有用的链接

- [VS Code API 文档](https://code.visualstudio.com/api)
- [Marketplace 发布指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Spec Kit 官方](https://github.com/github/spec-kit)
- [Spec Kit CN](https://github.com/Linfee/spec-kit-cn)

---

**提示**: 保存此文件以便快速参考！
