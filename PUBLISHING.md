# 打包和发布 Spec Kit VS Code 扩展

完整的打包、测试和发布指南。

## 前置要求

在发布前，确保以下已准备好：

### 1. 开发环境
- Node.js >= 18.0.0
- npm >= 9.0.0
- VS Code >= 1.90.0

### 2. 扩展信息准备
编辑 `package.json` 中的以下字段：

```json
{
  "name": "spec-kit-vscode",
  "displayName": "Spec Kit CN",
  "publisher": "your-publisher-id",
  "version": "0.1.0",
  "description": "...",
  "repository": {
    "url": "https://github.com/your-username/spec-kit-vscode"
  }
}
```

**注意**: `publisher` 字段非常重要，用于 Marketplace 上的唯一标识。

### 3. 图标和描述
- 在 `media/` 目录中添加 `logo.png`（128x128px）
- 准备清晰的 `README.md` 描述
- 准备 `CHANGELOG.md` 记录版本变更

## 打包流程

### 方式 1：使用自动化脚本（推荐）

**Windows:**
```bash
.\build.bat
```

**macOS/Linux:**
```bash
chmod +x build.sh
./build.sh
```

脚本会自动完成：
- 清理旧的构建文件
- 安装依赖
- 代码检查（lint）
- TypeScript 编译
- esbuild 最小化
- 打包为 .vsix

### 方式 2：手动步骤

```bash
# 1. 清理
rm -rf node_modules dist out *.vsix

# 2. 安装依赖
npm install

# 3. 代码检查
npm run lint

# 4. 编译
npm run esbuild

# 5. 打包
npm run package
```

### 构建输出

成功完成后，将在项目根目录生成：
```
spec-kit-vscode-0.1.0.vsix
```

## 本地测试

### 1. 安装本地构建的扩展

**方式 A：通过 VS Code UI**
1. 打开 VS Code
2. 按 `Ctrl+Shift+P`（或 `Cmd+Shift+P` on Mac）
3. 搜索并选择 "Extensions: Install from VSIX"
4. 选择生成的 `.vsix` 文件

**方式 B：命令行**
```bash
code --install-extension spec-kit-vscode-0.1.0.vsix
```

### 2. 验证安装

1. 打开包含 `.specify` 目录的项目（或运行初始化）
2. 检查侧边栏中是否出现 "Spec Kit" 视图
3. 按 `Ctrl+Shift+P` 搜索 "Spec Kit" 命令
4. 运行各个命令进行测试

### 3. 卸载测试版本

```bash
# 列出已安装的扩展
code --list-extensions

# 卸载扩展
code --uninstall-extension <publisher>.<name>
```

## 发布到 VS Code Marketplace

### 前置条件

1. **创建 Microsoft 账户**
   - 访问 https://aka.ms/SignupMicrosoftAccount
   - 创建或登录账户

2. **创建 Publisher**
   - 访问 https://marketplace.visualstudio.com/manage
   - 使用 Microsoft 账户登录
   - 创建新的 Publisher（ID）
   - **重要**: 记住 Publisher ID，在 `package.json` 中使用

3. **获取 Personal Access Token (PAT)**
   - 在 Marketplace 管理页面创建 PAT
   - 保管好，发布时需要使用

### 发布步骤

#### 1. 首次发布

```bash
# 使用 vsce（最简单）
npm install -g @vscode/vsce

# 登录
vsce login your-publisher-id

# 输入 PAT 当提示时

# 发布
vsce publish
```

或使用 npm 脚本：
```bash
npm run publish
```

#### 2. 更新版本

修改 `package.json` 中的 `version` 字段，然后发布。

使用语义版本（Semantic Versioning）：
- **Patch**: `0.1.0` → `0.1.1`（bug 修复）
- **Minor**: `0.1.0` → `0.2.0`（新功能，向后兼容）
- **Major**: `0.1.0` → `1.0.0`（重大变更）

自动更新版本：
```bash
# Patch 版本
npm run publish -- --patch

# Minor 版本
npm run publish -- --minor

# Major 版本
npm run publish -- --major
```

#### 3. 发布成功确认

发布后：
1. 访问 https://marketplace.visualstudio.com/ 搜索你的扩展
2. 在 VS Code 中搜索并安装你的扩展
3. 验证功能正常

## 维护和更新

### 版本管理

在 `CHANGELOG.md` 中记录每个版本的变更：

```markdown
## [0.2.0] - 2025-12-15
### Added
- 新增配置查看命令
- 新增 WebView 面板支持

### Fixed
- 修复 CLI 检测失败的问题

### Changed
- 改进错误提示信息

## [0.1.0] - 2025-12-11
### Initial Release
- 基础项目初始化
- 规范、计划、任务生成命令
- 侧边栏视图
- CLI 检测和版本检查
```

### 定期更新

1. 修复 bug 或添加功能
2. 更新 `package.json` 中的版本号
3. 更新 `CHANGELOG.md`
4. 执行 `npm run publish`

## 问题排查

### 打包失败

**问题**: "vsce not found"
```bash
# 解决
npm install -g @vscode/vsce
```

**问题**: "TypeScript compilation failed"
```bash
# 清理并重新构建
rm -rf node_modules dist out
npm install
npm run esbuild
```

### 发布失败

**问题**: "Authentication failed"
```bash
# 重新登录
vsce logout
vsce login your-publisher-id
```

**问题**: "Version already exists"
- 在 `package.json` 中增加版本号

**问题**: "Icon not found"
- 确保 `media/logo.png` 存在
- 尺寸至少 128x128 像素

## 最佳实践

### 1. 版本管理
- 遵循 Semantic Versioning
- 每次发布前更新 CHANGELOG
- 为重要发布创建 Git tag

### 2. 质量保证
```bash
# 发布前运行这些检查
npm run lint
npm run compile
npm run esbuild
npm run package

# 本地测试
code --install-extension spec-kit-vscode-*.vsix
# 手动测试所有功能
```

### 3. 安全性
- 不要在代码中硬编码密钥
- 使用环境变量处理敏感信息
- 定期审计依赖包

### 4. 文档
- 保持 README.md 最新
- 为新功能添加使用说明
- 在 CHANGELOG 中记录所有变更

## 发布清单

发布前检查：

- [ ] 代码经过 lint 检查
- [ ] 所有功能已本地测试
- [ ] README.md 更新
- [ ] CHANGELOG.md 更新
- [ ] package.json 版本号更新
- [ ] logo.png 已添加
- [ ] 没有调试代码或 console.log
- [ ] 依赖项都列在 package.json 中
- [ ] 代码注释清晰
- [ ] 错误处理完善

## 文件大小要求

- **Logo**: 最小 128x128px，建议 200x200px
- **VSIX 文件**: 通常 < 5MB
- **README**: 完整清晰的描述

## 有用的链接

- [VS Code Marketplace](https://marketplace.visualstudio.com/)
- [发布扩展指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [扩展清单参考](https://code.visualstudio.com/api/references/extension-manifest)
- [VSCE 文档](https://github.com/Microsoft/vsce)

## 后续支持

发布后：

1. **监控反馈**
   - 检查 GitHub Issues
   - 阅读 Marketplace 评论
   - 收集用户反馈

2. **快速修复 bug**
   - 严重 bug 应该快速修复和发布
   - 使用 patch 版本号

3. **定期维护**
   - 更新依赖包
   - 保持代码质量
   - 添加新功能

---

**准备好发布了？** 执行 `./build.sh` (macOS/Linux) 或 `.\build.bat` (Windows)，然后 `npm run publish` 🚀
