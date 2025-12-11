# Spec-Kit VS Code Extension - Requirements

## 项目概述
一个 VS Code 扩展，集成 `specify-cn` CLI，提供规范驱动开发的完整工作流。扩展会依赖已安装的 `specify-cn` CLI 工具运行。

## 核心需求

### 1. 依赖与前提条件
- **VS Code** >= 1.90.0
- **Node.js** >= 18.0.0
- **specify-cn CLI** - 必须安装（扩展启动时检查）
- **Claude CLI**（可选但推荐）- 用于 AI 功能

### 2. 核心功能

#### 2.1 项目初始化
- **命令**: `Spec Kit: Initialize Project`
- **快捷方式**: 命令面板快速访问
- **功能**:
  - 创建新项目或在现有项目初始化
  - 选择 AI 助手（Claude、Copilot 等）
  - 创建项目宪章文件
  - 初始化 Git 仓库
- **输出**: 
  - 使用 WebView 面板显示初始化进度
  - 成功完成提示

#### 2.2 生成项目规范
- **命令**: `Spec Kit: Create Specification`
- **功能**:
  - 调用 `specify-cn specify` 命令
  - 基于项目宪章生成规范文档
  - 支持 AI 助手交互
- **输出**:
  - 在编辑器中打开生成的规范文件
  - 显示生成结果概览

#### 2.3 生成技术方案
- **命令**: `Spec Kit: Create Plan`
- **功能**:
  - 调用 `specify-cn plan` 命令
  - 生成技术实施计划
  - 支持 AI 验证与迭代
- **输出**:
  - WebView 展示计划详情
  - 支持导出为 Markdown

#### 2.4 任务分解
- **命令**: `Spec Kit: Create Tasks`
- **功能**:
  - 调用 `specify-cn tasks` 命令
  - 将计划分解为具体任务
  - 支持导出到 GitHub Issues
- **输出**:
  - 任务列表 WebView
  - 与项目管理工具的集成选项

#### 2.5 项目配置查看
- **命令**: `Spec Kit: View Configuration`
- **功能**:
  - 展示当前项目的规范驱动开发配置
  - 显示已安装的 AI 助手
  - 显示宪章、规范、计划、任务的位置
- **输出**:
  - 侧边栏 WebView 面板

### 3. 用户界面

#### 3.1 侧边栏
- **视图 ID**: `spec-kit-explorer`
- **标题**: Spec Kit
- **内容**:
  - 项目概览（宪章、规范、计划、任务状态）
  - 快速操作按钮
  - 设置链接

#### 3.2 WebView 面板
- 初始化进度面板
- 规范预览面板
- 计划详情面板
- 任务列表面板
- 配置查看面板

#### 3.3 命令面板
- 所有功能通过命令面板可访问
- 支持快速搜索和执行

### 4. 技术实现细节

#### 4.1 CLI 检测与验证
- **启动时检查**:
  - 验证 `specify-cn` 是否在 PATH 中
  - 检查版本兼容性
  - 如果未安装，提示安装链接
  
- **检测流程**:
  1. 运行 `specify-cn --version`
  2. 解析版本号
  3. 比较最低版本要求（>= 0.0.85）
  4. 缓存检测结果，避免频繁调用

#### 4.2 子进程管理
- 执行 `specify-cn` 命令时：
  1. 使用工作区根路径作为 cwd
  2. 捕获 stdout / stderr
  3. 解析命令输出
  4. 超时设置（默认 120 秒）
  5. 错误处理和用户提示

#### 4.3 文件系统操作
- 监听 `.specify` 目录变化
- 自动更新侧边栏视图
- 检测新生成的文件

#### 4.4 日志与调试
- 输出通道：`Spec Kit`
- 支持调试模式（`spec-kit.debug` 设置）
- 记录所有 CLI 调用和输出

### 5. 配置项

#### 5.1 扩展设置
```json
{
  "spec-kit.cliPath": "",           // specify-cn 的自定义路径（留空使用 PATH）
  "spec-kit.autoDetectCli": true,   // 启动时自动检测 CLI
  "spec-kit.debug": false,          // 启用调试日志
  "spec-kit.defaultAiAssistant": "claude",  // 默认 AI 助手
  "spec-kit.showNotifications": true,       // 显示操作通知
  "spec-kit.openResultsInNewTab": true     // 在新标签页打开结果
}
```

### 6. 错误处理与用户反馈

#### 6.1 常见错误处理
- **CLI 未找到**:
  - 提示安装说明链接
  - 提供手动路径配置选项
  
- **CLI 版本不兼容**:
  - 显示当前版本和最低要求版本
  - 提示升级链接
  
- **项目未初始化**:
  - 提示运行初始化命令
  - 提供快速初始化按钮
  
- **命令执行失败**:
  - 显示错误消息和建议
  - 提供查看日志选项

#### 6.2 用户通知
- 使用 VS Code 内置通知 API
- 支持 Info、Warning、Error 三个级别
- 快速操作按钮（如"安装 CLI"、"查看日志"等）

### 7. 工作流示例

**场景 1: 新项目初始化**
```
1. 打开文件夹 → 扩展激活
2. 检测 specify-cn CLI ✓
3. 命令面板 → "Spec Kit: Initialize Project"
4. 输入项目名称 → 选择 AI 助手
5. WebView 显示进度
6. 项目初始化完成 → 侧边栏更新
```

**场景 2: 生成规范和计划**
```
1. 打开项目宪章文件
2. 命令面板 → "Spec Kit: Create Specification"
3. WebView 显示规范预览
4. 修改或确认
5. 命令面板 → "Spec Kit: Create Plan"
6. WebView 显示计划详情
7. 可选：导出或进一步迭代
```

**场景 3: 任务分解与执行**
```
1. 从计划生成任务
2. WebView 显示任务列表
3. 可选：导出到 GitHub Issues
4. 在编辑器中执行任务
```

### 8. 扩展兼容性

#### 8.1 与其他扩展的协作
- **GitHub Copilot**: 可共存，不冲突
- **Claude Code**: 可共存
- **Git**: 依赖 Git 命令行工具

#### 8.2 工作区支持
- 单文件夹工作区
- 多文件夹工作区（每个文件夹独立配置）
- 远程工作区（SSH、WSL 等）

### 9. 打包与发布

#### 9.1 项目结构
```
spec-kit-vscode/
├── src/
│   ├── extension.ts
│   ├── services/
│   ├── commands/
│   ├── ui/
│   └── utils/
├── media/
├── package.json
├── tsconfig.json
├── vsc-extension-quickstart.md
└── README.md
```

#### 9.2 发布目标
- VS Code Marketplace
- GitHub Releases
- 自托管（可选）

### 10. 性能与可靠性

#### 10.1 性能要求
- 启动延迟 < 100ms
- 命令执行时间根据具体操作（通常 1-30 秒）
- UI 响应流畅，不卡顿

#### 10.2 稳定性
- 错误处理完善
- 脚本命令可重复执行
- 支持取消长时间运行的命令

### 11. 扩展激活事件

```json
{
  "activationEvents": [
    "onStartupFinished",           // VS Code 启动完成时
    "onCommand:spec-kit.*",        // 执行任何 spec-kit 命令时
    "onView:spec-kit-explorer",    // 打开侧边栏视图时
    "workspaceContains:.specify/**" // 检测到 .specify 目录时
  ]
}
```

---

## 优先级与实现阶段

### 第 1 阶段（MVP）
- [ ] 项目初始化命令
- [ ] CLI 检测与验证
- [ ] 基础侧边栏视图
- [ ] 日志与错误处理

### 第 2 阶段
- [ ] 规范生成命令
- [ ] 计划生成命令
- [ ] WebView 面板显示
- [ ] 文件同步

### 第 3 阶段
- [ ] 任务分解命令
- [ ] GitHub Issues 导出
- [ ] 高级配置选项
- [ ] 性能优化

### 第 4 阶段
- [ ] 发布到 Marketplace
- [ ] 文档完善
- [ ] 用户反馈收集
- [ ] 持续维护

---

## 参考资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code WebView](https://code.visualstudio.com/api/extension-guides/webview)
- [Node.js Child Process](https://nodejs.org/api/child_process.html)
- [Spec Kit 官方文档](https://github.com/github/spec-kit)
- [Spec Kit CN 文档](https://linfee.github.io/spec-kit-cn/)
