# 发布指南

## 手动发布流程

### 1. 准备发布

```bash
# 1. 确保所有更改已提交
git status

# 2. 运行测试和检查
npm run lint
npm run esbuild

# 3. 更新版本号并发布
npm run release:patch   # 补丁版本 (0.2.0 -> 0.2.1)
npm run release:minor   # 次要版本 (0.2.0 -> 0.3.0)  
npm run release:major   # 主要版本 (0.2.0 -> 1.0.0)
```

### 2. 仅更新版本号

```bash
npm run version:patch   # 仅更新版本号，不发布
npm run version:minor
npm run version:major
```

### 3. 仅发布（版本号已更新）

```bash
npm run publish
```

## 自动发布流程

### 方式 1: 通过 GitHub Actions 手动触发

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Publish Extension" 工作流
3. 点击 "Run workflow"
4. 选择版本类型 (patch/minor/major)
5. 点击 "Run workflow" 按钮

### 方式 2: 通过 Git 标签自动触发

```bash
# 创建并推送标签
git tag v0.2.1
git push origin v0.2.1
```

## 发布前检查清单

- [ ] 所有功能已测试
- [ ] README.md 已更新
- [ ] CHANGELOG.md 已更新（如果有）
- [ ] 版本号符合语义化版本规范
- [ ] 所有更改已提交到 main 分支

## 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- **MAJOR** (主版本号): 不兼容的 API 修改
- **MINOR** (次版本号): 向下兼容的功能性新增
- **PATCH** (修订号): 向下兼容的问题修正

## 发布到 VS Code Marketplace

### 首次设置

1. 安装 vsce 工具：
```bash
npm install -g @vscode/vsce
```

2. 创建 Personal Access Token：
   - 访问 https://dev.azure.com/
   - 创建新的 PAT，权限选择 "Marketplace (manage)"

3. 登录 vsce：
```bash
vsce login <publisher-name>
```

### 发布命令

```bash
# 打包扩展
vsce package

# 发布扩展
vsce publish

# 发布特定版本
vsce publish 0.2.1

# 发布并自动增加版本号
vsce publish patch
vsce publish minor  
vsce publish major
```

## 故障排除

### 发布失败

1. **权限问题**：检查 PAT 是否有效
2. **版本冲突**：确保版本号大于当前发布版本
3. **文件缺失**：检查 .vscodeignore 文件

### 回滚发布

```bash
# 取消发布特定版本
vsce unpublish <publisher>.<extension-name>@<version>
```

## 相关链接

- [VS Code 扩展发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI 文档](https://github.com/microsoft/vscode-vsce)
- [语义化版本规范](https://semver.org/lang/zh-CN/)