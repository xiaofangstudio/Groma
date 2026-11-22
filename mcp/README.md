# Groma MCP

Groma 自带的 stdio MCP 服务，和桌面端读写同一批 `.groma` 工程目录：

- 默认根目录：`%USERPROFILE%\Documents\Groma`
- 可用 `GROMA_MCP_ROOT` 指定其它根目录（沙箱/测试）
- 所有写工具默认 `dryRun=true`，只有显式传 `dryRun=false` 才落盘
- 每次落盘前自动写 `snapshots/<时间戳>.json`，保留最近 20 份
- 不提供「稍后开放」工具，列出的工具全部可用

## 启动

```powershell
node mcp/groma-mcp.mjs
# 自检（使用临时目录，不碰真实工程）
npm run mcp:check
```

## 客户端配置

Claude Desktop / 其它兼容 MCP 的客户端：

```json
{
  "mcpServers": {
    "groma": {
      "command": "node",
      "args": ["D:\\20533\\deskbox\\fangwork\\Groma\\mcp\\groma-mcp.mjs"],
      "env": {
        "GROMA_MCP_ROOT": "C:\\Users\\<你>\\Documents\\Groma"
      }
    }
  }
}
```

## 工具

| 工具 | 用途 | 写盘 |
| --- | --- | --- |
| `groma_list_projects` | 列出本地工程 | 否 |
| `groma_project_summary` | 工程摘要、画板包围盒 | 否 |
| `groma_read_scene` | 读取并校验 scene.json | 否 |
| `groma_snapshot_info` | 工程实际路径与快照数 | 否 |
| `groma_create_project` | 新建 `.groma` 工程 | `dryRun=false` |
| `groma_add_frame` | 新增画板 | `dryRun=false` |
| `groma_update_node` | 改位置/尺寸/圆角/透明度/显隐/填充 | `dryRun=false` |
| `groma_duplicate_frame` | 复制画板 | `dryRun=false` |
| `groma_delete_node` | 删除画板及子树 | `dryRun=false` |

## 约定

- 工程 id = 目录名去掉 `.groma` 后缀
- 场景格式与桌面端 `src/core/types.ts` 一致（`version: 1`）
- 所有 id 做越界字符校验，禁止 `..`、斜杠、冒号与 Windows 保留字符
