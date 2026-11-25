# Groma UI 家族化改版记录

初版：2026-11-22 07:26（Asia/Shanghai）｜ 最近更新：2026-11-25 13:16（C04.2 四布尔 / z-order 差集 / 紧凑布尔菜单 / 159 tests）

## 这一轮为什么不是「美化」

Reelix 的失败不是功能少，而是**功能表和用户拿到的产品不是同一个东西**：交付的 exe 比源码旧、按钮没有后端、界面靠堆面板显得专业、图标还是脚手架默认。FloatLab 则是架构野心跑在可用性前面，界面重做被排到三期，长期停在半成品。

Groma 这一轮只做三件事：把首屏变成真正能开始工作的页面，把界面拉回 Strata / Chapter 同族口径，把每个新入口都接到真实行为上。没有新增假按钮。

## 参考到的三款主力

| 产品 | 吸收的点 | 不照搬的点 |
| --- | --- | --- |
| Strata | 两栏 StartPage、最大宽 1180、卡片不铺满屏幕、顶栏/面板分层、`min-width:0` + 单行省略 | 冷灰蓝的品牌色；Groma 保留暖黄 + 纸白 |
| Chapter | 欢迎页的叙事留白、标题与说明的层级、内容卡的呼吸感 | 600ms 入场、26s 呼吸和卡片流光；Groma 只保留 180ms 级反馈 |
| Scheda | 内容优先、chrome 后退、窗口边缘留白、空态不拿假图充数 | 壁纸式氛围；编辑器画布区仍保持中性底 |

共同点：**统一令牌、固定骨架、少量面板、完整状态、实拍窗口尺寸**。不是某一个具体色值。

## 实际改动

### 1. 欢迎页重做

- 删除旧的三区左栏首页，改成最大宽 1180 的两栏：新建设计卡 + 最近工程列表。
- 新建设计支持：
  - 桌面 1440×900
  - 手机 390×844
  - 平板 834×1194
  - 方图 1080×1080
  - 自定义 W/H（320–4096）
- `创建画板` 与 `Ctrl+N` 都按当前尺寸创建；`createDoc(name, width, height, frameName)` 已支持尺寸与画板命名。
- 最近工程使用单行列表，不放假缩略图；空态是虚线画板 + 下一步说明。
- 不出现尚未实现的「打开工程…」「从模板开始」「拖入文件」。

**第二轮（2026-11-22，用户反馈“怪怪的”后）**

- 拆掉两块大白卡，改成 Chapter 式英雄区 + 紧凑新建卡 + 全高工程书架；最大宽 1240，左右栏顶部对齐、右栏拉齐到英雄区高度。
- 英雄标题改用 `--font-display` 中文衬线（Noto Serif SC / 思源宋体 / 宋体），`画板` 用品牌深黄加细下划线；界面控件仍用 `--font-ui`。
- 增加 3 条静态 SVG 纸面曲线，替代重光效和大面积动效；保留极淡点阵与顶部黄色径向光晕。
- 去掉巨型画板预览框；最近工程卡仍用文件页图标明确表示“工程”，不冒充设计预览。
- 低高度窗口压缩页头、标题、内边距与预设高度，最小窗口实拍无重叠、无横向溢出。

### 2. 家族令牌落地

`src/styles/tokens.css`：

- 圆角从 2/4/8/12/16 收敛为 6/6/8/12/16/999。
- 字号补齐 10/11/12/13/14/16/20/26，正文默认 13；删掉 12.5、11.5、10.5 这类散值。
- 间距补齐 4/8/12/16/24/32/48/64。
- 控件高 34、字段高 30 作为统一口径。

`src/styles/app.css`：

- 顶栏文档名 28 高、导出按钮 28、缩放 28。
- 图层面板头 36、图层行 30、底栏 30。
- 检查器选择行 38、字段 30、颜色块 28、文本域 64。
- Toast 38、弹窗 `max-width: calc(100vw - 48px)`，避免窄窗被裁。
- 焦点环改为 2px brand，偏移 2px。
- 增加 `prefers-reduced-motion` 全局降级。

### 3. 截图工具

`tools/shot.ps1` 新增 `-WinWidth/-WinHeight`，只改窗口尺寸不移动窗口，用于三档验收。虚拟桌面仍在 `finally` 中关闭。

2026-11-25 修掉截图黑边：`PrintWindow` 会把 Windows 不可见缩放边框（本机 DPR 1.5 为左/右/底各 11px）画成黑边。截图后按 `GetClientRect` 宽度计算边框，裁掉左右各 `border`、底部 `border`，保留顶部标题栏与客户区；复拍 2582×1550→2560×1539，左/右/底黑像素均为 0。

## 验收结果

- 单元测试：9 个文件、33 条全绿。
- `npm run gate`：`✓ GATE PASS`。
- EXE：`src-tauri/target/release/groma.exe`
  - 3,259,392 B（约 3183 KB）
  - 2026-11-22 07:22:55
  - SHA256 `0A8BBB5601E1F497260767B4D838B8EA01DE271C2E8838971C95CAFE5EDC9912`
- 基准（本轮 gate）：
  - 命中首节点 0.162ms
  - 200 步撤销 262.7ms
  - 2000 节点复制 4.7ms
  - 序列化 1,457,772 B；100 次往返不一致 0

### 三档窗口实拍

| 档位 | 截图 | 像素 | 结果 |
| --- | --- | --- | --- |
| 1440×900 逻辑 | `shots/ui2-welcome.png`、`shots/ui2-sample-selected.png` | 2182×1406 | 两栏完整，画布/面板无横向溢出；选中「黄色卡片」后检查器 X/Y/W/H、填充、外观完整 |
| 约 1120×720 | `shots/ui2-editor-mid.png` | 1700×1120 | 顶栏工具组、右栏检查器、底栏完整 |
| 约 1040×680 | `shots/ui2-welcome-min.png`、`shots/ui2-editor-min.png` | 1580×1060 | 两栏不互压，检查器文字正常换行，画布保留可操作宽度 |

### 端到端尺寸验证

- `shots/ui2-phone-select.png`：点击「手机 390×844」后，W/H 输入同步为 390/844。
- `shots/ui2-phone-editor.png`：再点「创建画板」，编辑器生成竖向画板，图层名为「手机 390」，缩放 60%。

## 仍然没做

- 三档窗口的自动像素扫描 `npm run overflow` 仍未实现；这轮是实拍 + CSS 规则检查，不能写成「自动扫描已通过」。
- 60fps @ 5000 节点真实画布仍未量。
- 布尔、矢量路径、组件/变体、Auto Layout、约束、手动参考线、间距数字胶囊等仍未做；多选 / 框选 / 成组、移动/缩放吸附已在 2026-11-22 的功能切片落地，不要因为字距和圆角变好就误判为其余功能已齐。
- 欢迎页的工程缩略图还没做，当前用文件夹图标明确表示「工程」，不冒充预览图。

## 多选 / 框选 / 成组功能切片（2026-11-22 11:30）

这一轮不再动欢迎页，只把 README 的下一刀接成真实链路：多选 / 框选 → 成组 → 对齐 / 分布。

- 状态层从单 `selectedId` 扩成 `selectedIds` + `selectedId`（primary），旧单选入口保持兼容；Shift 点击加减选，图层树同步高亮所有选中行。
- 框选从画布空白开始，拖拽时画屏幕坐标虚线框。完整框住容器选容器，只压到容器一部分则向下选真正被命中的子节点；锁定/隐藏节点不参与。
- 多选拖动只移动顶层节点，一个事务一条撤销；方向键、批量删除、复制、对齐/分布同样各自单步撤销。
- 多选检查器显示选区 W/H/X/Y，6 个对齐按钮 + 水平/垂直等间距（少于 3 个时明确禁用并说明原因），以及成组入口；不铺没有实现的混合属性编辑。
- `Ctrl+G` 成组、`Ctrl+Shift+G` 解组。组内保持原图层上下顺序，分组插到原最高选中图层的位置；子节点坐标改相对组，解组改回相对父级。
- 组是透明容器：单击回到最外层组，双击穿透到组内；组外接框由子节点实时推导，子节点拖出旧范围后仍可命中、可框选，分组不做假缩放把手。
- 浮层/提示沿用暖黄选中描边与虚线组合框；多选时只画角点手柄给单选，避免暗示未实现的多节点缩放。

**验收**

- `npm run gate`：11 个测试文件、47 条测试全绿；EXE 3,210 KB，2026-11-22 11:30:12 新编。
- 真实窗口截图：`shots/editor-multi-final.png`（Shift 多选）、`editor-multi-drag-final.png`（同步拖动）、`editor-group-final.png`（成组检查器）、`editor-ungroup-final.png`（解散后回到多选）。
- 临时验收工程 `_验收临时.groma` 与中间截图已清理；`Groma-自检.groma` 已从快照恢复为未分组原样，场景 2,178 B。

## 移动 / 缩放吸附与 Smart Guides 功能切片（2026-11-22 18:00）

这一轮只接 README“下一刀”里的吸附，不横铺手动参考线、间距数字胶囊和绘制时吸附。

- 新增 `src/core/snapping.ts`：选区左/中/右、上/中/下与目标边/中心比对，8 屏幕像素内取最近的一档，返回位移与参考线；缩放只吸正在拖的边，固定边不动，禁止拖过固定边造成负宽高。
- 吸附目标取当前页可见、未锁定节点的绝对外接框；递归排除选区自身与子树，但保留父画板当目标，所以选中画板不会吸进自己的子节点。
- 移动按选区整体外接框计算位移，多选一起吸附，不是每个节点各吸各的；缩放按角点对应的活动边吸附，触发时不改写另一边。
- 阈值固定 `SNAP_PX = 8`，按 `8 / viewport.scale` 换到场景坐标，所以 56% 视口下仍是屏幕上 8px 的手感。
- 参考线走画布上的绝对定位 DOM 图层：主黄 4px 实、3px 空，分 X/Y 两种；不进入每帧渲染热路径，也没有用 backdrop-filter 或重阴影换观感。
- 拖动中状态条显示“拖动中 · 8px 吸附 · Alt 临时关闭”，松手与取消都清空参考线和提示；`Alt` 由 pointer 事件的 `altKey` 接线并已有核心 disabled 单测，自动化鼠标无法投递物理 Alt，这一条没有写成真实键盘已验收。
- 新增 `src/core/snapping.test.ts` 8 条：左边吸附、中心吸附、超阈值不吸附、禁用、缩放右边固定左边、左上角双轴吸附、目标排除选区子树、目标排除选中画板子树。

**验收**

- `npm run gate`：12 个测试文件、55 条测试全绿；EXE 3,211 KB，2026-11-22 18:00:35 新编。
- 干净验收工程只留 1 个画板，避免上一轮遗留的“画板 2”干扰视口适配：
  - `shots/editor-smart-guides-move.png`：黄色卡片从 X140 吸到 X200，右边贴住黑色圆左边缘，卡片顶部与圆顶部出现水平黄虚线；检查器 X200 / W320 / H200，松手后落盘复验 X200。
  - `shots/editor-smart-guides-resize.png`：黑色椭圆右边从 720 吸到 780，与标题右边界对齐，W260 / H200，右侧出现纵向黄虚线；不遮挡标题、副标题和横条。
- 截图工具 `tools/shot.ps1` 新增 `-HoldDrag`：鼠标保持按下时截图，参考线在拖动中才可见；`-AltDrag` 因 PostMessage 投递不了物理 Alt 已删除，不留假开关。
- 临时 `_吸附*` 工程与中间截图已清理；`Groma-自检.groma` 从快照恢复为 1 个画板、无分组，场景 2,178 B。

**这轮边界**

- 只做移动 / 缩放吸附；手动参考线、间距数字胶囊、画新形状时吸附仍未做。
- Alt 临时关闭已接线，但没有真实键盘截图，不能写成“真实窗口 Alt 已通过”。
- 自动截图看到的黄虚线是产品内的 DOM 参考线，不是测试脚本画的辅助线。

## 手动参考线与适配动效切片（2026-11-22 18:56）

这一轮只接上一刀留下的手动参考线，并补一个全应用适配动效；不动面板布局，不做原型连接。

- `Page.guides` 存 `{ axis:'x'|'y', position }`，v1 直接进 `scene.json`；`pages/<id>.meta.json` 继续作为后续拆分预留，不在文档里假装已经存在。
- 顶部标尺向下拖出水平线（Y），左侧标尺向右拖出竖线（X）；拖线时提示“拖动放置参考线 · Y 408”，松开后落盘。
- 画布内悬停线显示 `ns-resize` / `ew-resize`；按下拖动移动，拖回标尺变红并删除；悬停 `Delete` / `Backspace` 也能删；`Escape` 取消拖线。
- 添加、移动、删除各写一条 `HistoryEntry`，逐步可撤销；不混入节点历史。
- 手动线与节点参考线同阈值竞争：8 屏幕像素内近者优先，同距离优先节点；移动、缩放都参与，吸附参考线带 `manual: true`。
- 适配按钮与 `Shift+1/2` 走 180ms 三次缓出，只动 viewport；`prefers-reduced-motion` 直接落位，拖动和滚轮保持即时跟手。

**自检拦下的真实问题**

- 第一次真实窗口从顶部标尺拖线失败，scene 里 `guides=null`。原因是把起点 `888,50` 打在了标尺上方的顶栏，不是标尺内；改到 `888,65` 后拖动中出现草稿线，松开落盘 `{ axis:'y', position:408 }`。
- 移动线时又发现抓不住：`guideAt` 把指针内容坐标和“含标尺”的画布线位置直接比较，命中区整体偏下 20px。修复为统一走 `src/core/guides.ts` 的内容坐标公式，并加 3 条纯函数回归测试；修复后真实拖动 Y408→360，画板保持 Y0。
- 拖回标尺删除也重新验证：参考线从 scene 清空，画板仍为 Y0，截图无残线。

**验收**

- `npm test -- --run`：13 个测试文件、63 条测试全绿；新增 `guides.test.ts` 3 条。
- 真实窗口：`shots/editor-manual-guide.png` 水平线 Y360，位于卡片/圆下方，不压标题；`shots/guide-final-delete.png` 删除后画面干净。竖线草稿在 `shots/guide3-vhold.png` 验证了 X 轴入口，未作为终图。
- 临时工程 `_参考线验收*.groma`、失败截图和中间截图在收尾时清理；只保留最终验收图和源工程快照。

**这轮边界**

- 只做手动参考线 + 适配动效；间距数字胶囊、画新形状时吸附、参考线列表/锁定/显示开关、跨页参考线仍未做。
- 原型连接没有开工；Figma Prototype 的解释只是答疑，不是功能。


## 多页面核心切片（2026-11-22 19:51）

这一轮只接能力矩阵第一刀 A02 的核心链路：页列表、新建、改名、复制、删除、切换、撤销与保存重开。不新增第六个常驻区域。

- 左栏现有 Pages 区里做页列表：当前页高亮、顶层图层计数、行内 `...` 菜单；标题右侧只加一个 `+` 与原有的面板收起按钮。
- 新建页生成独立 `type='page'` 根节点，背景 `#E9E8E4`，页名默认取未占用的“页面 N”；新建后自动切到新页并清空选区。
- 改名走行内 input：双击页行、`F2`、`...` 菜单都能进入；回车或失焦提交，`Escape` 取消；页面名与根节点名同步。
- 复制页深克隆整棵页面子树，重新映射节点 id，副本插在源页后面，名称取“源页名 副本”并自动去重；复制后切到副本。
- 删除页连同根子树一起移除；删当前页切到相邻页并清空选区；只剩一页时删除禁用，菜单里直接显示“至少保留一个页面”。
- 页面新建/改名/复制/删除进 `pages` 历史条目，撤销/重做恢复页结构与页级选区；切页本身不写历史，只清选区并重新适配画布。
- 页列表复用现有左栏，不抢画布；页面多时列表内部滚动，图层区仍独立滚动。最小 1040×680 与 1600×1000 实拍无横向溢出。

**验收**

- `npm run gate`：14 个测试文件、72 条测试全绿；新增 `src/core/pages.test.ts` 5 条与 `editor.test.ts` 页面链路 4 条；MCP selftest 通过；EXE 3,215 KB，2026-11-22 19:58:34。
- 真实窗口：`shots/pages-final.png` 三页状态；`pages-add.png` 新页空态；`pages-switch.png` 切回页面 1 恢复画布；`pages-rename-commit.png` 行内改名；`pages-duplicate.png` 复制副本；`pages-delete.png` 删除副本；`pages-last-menu-final.png` 最后一页禁用；`pages-undo.png` / `pages-redo.png` 撤销重做；`pages-save-add.png` / `pages-save-reopen.png` 保存重开两页仍在；`pages-compact.png` / `pages-wide.png` 两档窗口。
- 保存复验：`Groma-多页面自检.groma\scene.json` 的 `pages[]` 为 2 条，页面根节点与内容子树都在；临时工程在验收后清理，`Groma-自检.groma` 未改。

**这轮边界**

- 页面拖排序、缩略图、跨页搜索、每页独立缩放/滚动记忆未做；矩阵 A02 只标“核心已落地”，不标全量完成。（拖排序与页级视口记忆已在下节补齐）
- 行内改名真实窗口用自动化输入英文 `Home` 验证；中文走同一个标准 input，未用 IME 实拍。
- 不新增页面模板、跨页组件或缩略图占位；没有假按钮。

## 多页面拖排序与页级视口记忆切片（2026-11-22 20:50）

这一轮只补 A02 上一刀留下的两条缺口：页面拖排序和每页独立缩放/平移记忆。仍然复用左栏 Pages 区，不新增常驻面板。

- 拖排序：页行 `pointerdown` 后先过 5px 阈值才进入拖动态；按其余页行的中点算目标索引；插入线是 `position:fixed` 的 2px 主黄短线，源页行淡到 45%；拖到页列表上下边缘会自动滚动。
- 松手调用一次 `editor.movePage()`，排序写 `pages` 历史条目；排序后当前页不变。拖动结束会抑制一次点击，避免“拖完顺手切页”。
- 页行另留键盘等价入口：聚焦后 `Alt+↑/↓` 上移/下移一页。
- 每页视口：`EditorState.viewports` 以页 id 记录 `{x,y,scale}`；平移、滚轮缩放、顶栏缩放、Shift+1 都写回当前页；切页优先恢复记录，没有记录才适配；删除页切相邻页、撤销删除回到被删页时同样恢复各自视口。
- 数据层新增 `movePage(doc,pageId,toIndex)`，只改 `pages[]` 顺序，不动页面内节点；越界、原位返回 `null`。

**验收**

- `npm run gate`：14 个测试文件、76 条测试全绿；新增页面拖排序纯函数 1 条、拖排序撤销 1 条、页级视口切换 2 条；MCP selftest 通过；EXE 3,216 KB，2026-11-22 21:10:07。
- 真实窗口：`shots/pages-drag-hold.png` 按住拖动显示插入线与源页淡出；`pages-drag-top.png` 页面 3 拖到顶部；`pages-drag-bottom.png` 从非当前页把页面 1 拖到底，松手后页面 3 仍是当前页；`pages-viewport-page1.png` 页面 1 空格拖平移后的视口；`pages-viewport-page2.png` 切到页面 2 后回到默认视口；`pages-viewport-back.png` 再切回页面 1 恢复平移；`pages-final-drag.png` 最终 EXE（21:10:07）三页拖排序结果。
- 截图工具 `tools/shot.ps1` 增加 `-Actions` 顺序动作与 `spacedrag` / `combo`，用于“加页→切页→平移→切页→切回”这类多步验收；旧参数保持兼容。

**这轮边界**

- 视口记忆只在本次会话内存中，尚未写进 `scene.json`；重开工程仍回到第一页与默认视口。
- 页面缩略图、跨页搜索与“关掉重开仍回上次页/视口”**已于 2026-11-23 补**，见下一段；本节仅记录 11-22 当日边界，不代表当前版本。
- `Alt+↑/↓` 已接入代码，但虚拟桌面的 `PostMessage` 不能可靠合成 Alt 按下状态，未单独用合成键实拍；鼠标拖到的顶部与底部落点均已实拍。
- 没有新增“页面模板”“跨页组件”或缩略图占位；没有假按钮。

## 多页面第三批：缩略图、跨页搜索与页级视口持久化（2026-11-23 13:40）

这一轮把 A02 剩下的三条缺口补齐，仍然复用左栏 Pages 区，不加常驻面板，也不做“搜索中心”。

- 页行缩略图：`drawPageThumbnail()` 复用画布同一套 `drawNode`，按页面顶层子节点的 `absoluteRect` 求内容包围盒后等比适配，画板不画阴影和名称；34×22 CSS px、DPR 2；空页面只画极淡“空”字。当前页编辑时在 100ms 尾部合并后重绘，非当前页保留上次画面，避免拖动时重画所有页。
- 跨页搜索：页头搜索图标打开左栏内的瞬态浮层，按页面顺序深度优先搜图层名称；结果显示图层图标、图层名、父级路径、页面名。点击结果先切页再选中节点，焦点回到页行；`Esc` 关闭并恢复搜索按钮焦点，点击外部也关闭。浮层不抢画布，不新增搜索页。
- 页级视口持久化：`src/state/project-ui.ts` 以 `groma:project-ui:v1:<projectId>` 写入当前页 id 与各页视口；读取时校验 JSON、页 id 和视口数值，坏数据直接忽略。打开工程与 `--open` 启动都恢复，`EditorShell` 120ms 防抖保存并在 `beforeunload` 冲刷。
- 顺手修掉“打开工程就多一个版本”的自动保存误触发：`savedDocRef` / `savedProjectRef` 守卫让首次挂载若 doc 与 projectId 都是初始值就跳过；真实编辑后照常保存；新工程从 `projectId=null` 到 id 到位仍保存一次。

**自检拦下的真实问题**

- `search.test.ts` 一开始两条失败，报“节点不存在：test-2”。不是搜索函数错，是测试夹具继续在旧 `doc` 上 `applyCommand`，而新页在 `addPage()` 返回的新 `doc` 里；改用 `second.doc` 后 4 条全绿。
- 缩略图性能：第一版每次 doc 变化都重画所有页；改为只有 `active` 当前页跟随 doc 变化、非当前页保持缓存，并在 2026-11-23 补丁中加 100ms 尾部合并与 8ms/页首次错峰，连续拖动期间不再和主画布抢帧。
- 搜索浮层关闭后的焦点：`Esc` 关闭时把焦点还给搜索按钮，真实窗口能看到焦点环；没有把“按 Esc 后焦点回到搜索按钮”写成空话。
- 自动保存误触发：打开 `未命名设计-15` 前后快照数 5→5；修复前会无端写一份同内容版本。

**验收**

- 单元测试：搜索 4 条、界面记忆 2 条、`editor.loadDoc` 恢复 1 条；完整 `npm run gate` 为 16 个测试文件、84 条测试全绿（含新增 `project.test.ts` 的 `snapshotBefore=false` 传参断言）。
- 真实窗口：`shots/thumb-base.png` 页行首次出现真实缩略图；`thumb-live-rect.png` / `thumb-crop.png` 画矩形后缩略图同步出现灰块；`thumb-active-check.png` 当前页重绘优化后仍同步；`search-open.png` 浮层聚焦；`search-query.png` 搜 `1440` 命中画板；`search-select.png` 点击结果选中；`search-crosspage.png` 从页面 3 搜回页面 1；`search-two-pages.png` 复制页后出现两条跨页结果；`search-click-first.png` 点第一条切回页面 1；`search-esc.png` Esc 关闭后按钮焦点环；`persist-page-before.png` / `persist-page-reopen.png` 关掉重开仍回页面 3、标尺位移保持。
- 交付指纹：`npm run gate` PASS（16 个测试文件、84 条测试；MCP selftest 通过）；最终 EXE 3,232 KB，2026-11-23 13:58:48。

**这轮边界**

- 搜索浮层支持点击、`Esc`、外部关闭，不支持上下键选择结果；代码有 `Ctrl+F` 入口，但虚拟桌面 `PostMessage` 合成 `Ctrl` 不可靠，未把 `Ctrl+F` 实拍写成通过。
- 非当前页缩略图在切页后才重画，不保证后台页面的实时刷新；这是性能取舍，不是“实时全量缩略图”。
- 页级视口存在 WebView 的 `localStorage`，与工程目录分开；换机器或清 WebView 数据会丢失视图记忆，但工程内容不受影响。
- 页面缩略图不是 Figma 的页面封面，不提供自定义封面；不做页面模板。

## A05 版本历史浏览与回滚（2026-11-23 13:58）

版本历史不是新开一个工作区，而是顶栏一个“版本”按钮 → 一个只读弹窗；预览不改当前工程，恢复必须二次确认。

- 后端：Rust 新增 `groma_list_snapshots` / `groma_create_snapshot` / `groma_load_snapshot` / `groma_restore_snapshot`；快照仍在 `<工程>/snapshots/<毫秒时间戳>.json`，每个工程最多保留 20 份，超出删最旧。
- 恢复：前端先 `saveProject(projectId, doc, false)` 把内存里的最新改动落盘，再由 Rust 把当前 `scene.json` 快照一份，最后写回选中版本；因此“恢复”本身还能再回滚，刚改完还没等到 600ms 自动保存的编辑也不会丢。读取与恢复都要求快照是 JSON 对象。
- 手动存版本：先 `saveProject(projectId, doc, false)` 落当前场景但不额外快照，再 `createSnapshot` 生成一条；`groma_save_project` 新增可选 `snapshot_before`，默认 true，普通自动保存/`Ctrl+S` 仍先留底。
- 去重：`groma_save_project` 发现新 scene 与当前 `scene.json` 完全一致时跳过留快照。恢复版本后紧接着的一次自动保存不会把同一份内容再记一个版本；普通“只打开工程”也不会凭空多版本（`EditorShell` 的 `savedDocRef/savedProjectRef` 守卫）。
- 前端：`VersionHistory.tsx` 是 820×620 上限的响应式弹窗；左侧版本列表（最新在上，显示时间与体积），右侧页面预览（复用 `drawPageThumbnail`）、页面数/图层数/大小；多页快照可切页预览；顶部“存一个版本”，底部“恢复到此版本”二次确认；`Esc`/背景关闭，关闭按钮 `autoFocus`。

**自检拦下的真实问题**

- 打开工程即自动保存：修复前只打开 `未命名设计-15` 就多一个快照；守卫后打开前后 5→5。
- 手动存版本双份：第一次实拍点“存一个版本”列表 5→9，一次点击产生多条；原因是 `saveProject` 自身快照 + `createSnapshot` 再快照。加 `snapshot_before=false` 后新 EXE 实测快照文件 9→10，只增一条。
- 恢复后自动保存重复：新 EXE 实测恢复一次让快照 10→12；后端加“内容相同不留快照”后重建 EXE，恢复一次只 12→13（只增加恢复前留底这一条），不再把恢复后的同内容自动保存记成版本。
- 最小窗口：1040×680 首版预览画布过高，压住“页面 1”标题与元信息；改为预览区进网格 `1fr` 行、画布 `max-width/max-height:100%` 居中约束，重建后复验。

**验收**

- 单元测试：新增界面记忆 2 条、`editor.loadDoc` 恢复 1 条、`project.ts` 保存参数 1 条；完整 `npm run gate` 为 16 个测试文件、84 条测试全绿。
- 真实窗口：`version-topbar.png` 顶栏“版本”入口；`version-open.png` 快照列表 + 页面预览；`version-confirm.png` 二次确认文案；`version-restored.png` 恢复最老 630 B 快照后工程从 3 页回到 1 页；`version-noop-open.png` 打开工程快照数 5→5；`version-manual-one.png` 新 EXE 手动存版本后列表 10 条、文件数 9→10；`version-restore-no-dup.png` 恢复最新版后画布单页、文件数 12→13，证明恢复后的自动保存不再重复留版本；`version-restore-3pages-final.png` 选 13:36:29 的 3 页快照恢复，画布回到 3 页（页面 2/3 空态可见）、文件数 13→14（只增加恢复前留底）；`version-compact.png` 1040×680 版本弹窗，预览标题/元信息不再被画布压住；`version-open-final.png` 1400×900 最终弹窗，13 个版本打开工程仍为 13；`version-final-restore.png` 最终 EXE 在复制自检工程（20 份快照上限）上恢复最新版，画布显示 6 图层设计，确认恢复前落盘链路无回归；`version-final-modal.png` 最终 EXE 打满 20 份的自检工程，打开后仍为 20→20，弹窗显示 20 个版本与 6 图层预览。
- 交付指纹：`npm run gate` PASS（16 个测试文件、84 条测试；MCP selftest 通过）；EXE 3,232 KB，2026-11-23 13:58:48。

**这轮边界**

- 只有时间列表，没有命名版本、逐帧对比、分支合并；不能给版本写备注。
- 版本列表没有自定义上下键导航与焦点陷阱；Tab 可遍历，`Esc` 可关，关闭后焦点由浏览器默认回收，未单独做“恢复后回到版本按钮”的焦点管理。
- 恢复不是编辑历史的一步，不能 `Ctrl+Z` 撤销；靠“恢复前留底”再恢复回去。
- 快照是整份 `scene.json` 副本，不做压缩/增量；20 份上限是磁盘保护，不是无限历史。
- 自动保存仍靠 600ms 去抖，关闭窗口前的最后 600ms 改动仍可能丢；崩溃恢复入口未做。
- 快照文件名只到毫秒，列表显示到秒；同一秒内多个版本会出现相同时间文案（本次已把正常路径的同内容重复快照去掉，但恢复留底与旧版本仍可能同秒）。

## 渲染补丁：页缩略图不再抢帧（2026-11-23 19:01）

用户反馈“只该渲染一个地方，但基本同时渲染”，这句话被解释为页缩略图与主画布同帧绘制；没有把它当成 Tauri/WebView2 双 surface 的已确认结论。

- `PageThumbnail` 从同步 effect 改为 100ms 尾部合并；首次挂载按页序号 8ms 错峰（最多 160ms）；连续拖动时只保留最后一次，停手约 100ms 后画。
- `drawPageThumbnail` 增加缩略图专用上限：最多 3 层、跳过投影后小于 0.5px 的节点，同时返回 `DrawStats`；页面内容包围盒与底色仍保留。
- `LeftPanel` 页列表 map 传入 `pageIndex`，错峰以页序为准，不按 React 渲染顺序猜。
- 基准：5000 节点场景共 5,051 个节点，缩略图只画 50 个画板，其余 5,001 个节点不进入绘制；mock context 平均 0.37ms/次（全量 gate 并行时 0.41ms）。这不是 GPU 帧率，只证明缩略图的 JS 遍历已从整页降到顶层框。
- 真实窗口：`shots/thumb-delay-final.png` 在最终 EXE 画板内画 239×179 矩形，等 1200ms 后页缩略图出现灰块；`shots/thumb-delay-crop.png` 为放大裁切。确认 active 页没有停在旧图。
- 交付指纹：`npm run gate` PASS（16 个测试文件、84 条测试；MCP selftest 通过）；前端 `index-B0_9leUO.js` 347.69 kB；EXE 3,233 KB，2026-11-23 19:01:34。
- 边界：非当前页缩略图仍不后台实时刷新；0.37ms 是 mock 成本，不代表 60fps；WebGPU 未接，`draw.ts` 仍是 Canvas 2D 集中入口，后续可作为栅格化后端替换点。

## A03 Section 基础链路（2026-11-23 19:12）

Section 不是“换皮画板”，是页面下的一层透明容器：有名称、边框、可选填充，不裁剪子图层；子 Frame 可随 Section 移动，导出时只导出区块内容。

- 类型：`NodeType` 增加 `'section'`，schema 同步接受；section 默认无填充、`clipContent=false`；旧工程不受影响，新工程写入 `type:"section"`。
- 创建：顶栏新增“区块工具 S”，画布拖拽创建；单击默认 800×600；图层树显示区块图标，顶层区块可折叠；右栏显示“区块”名称/尺寸/填充/透明度。
- 挂载：`deepestFrameOrSection()` 只在新建画板时允许把 Frame 挂进 Section；普通矩形/椭圆仍只挂画板或页面，避免图形被误塞进区块。Section 本身只从页面根创建，不做无限嵌套。
- 渲染：`drawSection` 画细边框 + 左上角名称 + 可选填充，不裁剪子节点；名称在 `scale < 0.15` 时隐藏，避免 34×22 缩略图被文字糊满。
- 导出：`renderFramePng` 接受 frame 或 section；Section 导出裁到 Section 边界，只画子节点，不画区块标签/边框；`pickFrame` 选中区块时导出整块，选中子 Frame 时仍导出 Frame。
- 删除：整块 Section 删除会连同子 Frame 进入同一条撤销记录；撤销恢复子树（editor 测试覆盖）。

**验收**

- `shots/section-final.png`：最终 EXE 用 `S` 拖出“区块 1”，右栏显示区块属性，状态栏“1 个画板 · 1 个区块”。
- `shots/section-frame-final.png`：按 `F` 在区块空白处画“画板 1”，图层树出现“区块 1 → 画板 1”嵌套，状态栏“2 个画板 · 1 个区块”。
- `shots/section-export-final.png`：选中区块打开导出，弹窗显示“区块 · 区块 1”，1× 1290×693 / 2× 2580×1386。
- `shots/section-export-child.png`：区块内含子画板时导出完成，Toast 显示 `区块 1@2x.png`；`shots/section-exported-content.png` 是复制出来的实际导出文件（2580×1386、73,804 B），图内只保留子画板边框，没有区块标签。
- `shots/section-compact-final.png`：1040×680 物理窗口（约 693 CSS px）顶栏新增区块工具后仍不挤：品牌字标在窄窗隐藏，版本/导出只留图标，工程名、6 个工具、缩略图与右栏都可读。
- `shots/section-reopen-final.png`：最终 EXE 关闭重开工程，区块与子画板仍在，图层树默认折叠但画布内容完整。
- 门禁：`npm run gate` PASS，16 个测试文件 / 87 条测试；前端 `index-rChFs5ZL.js` 349.70 kB；EXE 3,233 KB，2026-11-23 19:23:09。

**这轮边界**

- 区块只在页面根创建，不能嵌套区块；已有画板不能通过图层树拖进区块，只能在区块空白处新建画板。
- 区块标签不可点击选中，点区块内空白区域或图层行选中；子画板在区块内仍按自己的坐标/裁剪规则绘制。
- 没有 Section 专属背景色/封面/说明字段，背景走通用填充；没有 Section 专属右键菜单。
- A03 Section 自身只实拍了 PNG 1×/2×；A08 已支持 JPG/SVG 与本页批量，但 Section 的 JPG/SVG 和批量组合未单独实拍。

## A08 导出：PNG / JPG / SVG 与本页批量（2026-11-23 20:12）

导出不是把三个后缀塞进旧弹窗：光栅与矢量共用同一套节点遍历规则，弹窗只负责格式、范围、倍率与状态。批量是逐个写文件并复用同一套命名/去重逻辑，不是“先假装成功再补文件”。

**工程链路**

- `src/render/draw.ts`：抽出 `renderFrameRaster()`，`renderFramePng()` 与 `renderFrameJpg()` 共用画布绘制；JPG 强制填白（不透明）、质量 0.92；PNG 保留透明背景与 1×/2×；目标仍是 Frame 或 Section，Section 裁到区块边界、不带标签和边框。
- `src/render/svg.ts`：新增纯函数 `renderFrameSvg()`，以目标左上角归零坐标输出；支持 rect / ellipse / text / frame / section / group、填充、透明度、圆角、Frame 裁剪、多行 `tspan`；文本做 XML 转义；Section 导出不输出区块名称与边框；SVG 不支持倍率，弹窗隐藏倍数区。
- `src/io/project.ts`：新增 `exportFile(id, suggestedName, format, payload)`，统一 PNG/JPG/SVG 的写入入口，保留 `exportPng()` 兼容旧调用。
- `src-tauri/src/main.rs`：新增 `groma_export_file`，扩展名白名单 png/jpg/jpeg/svg；PNG/JPG 校验 data URL 前缀并 base64 解码，SVG 按文本写入；限制 64MB 输入 / 48MB 文件；同名自动加序号，不覆盖旧文件。
- `ExportDialog.tsx`：格式三选一、范围“当前选中 / 本页全部 (N)”、批量按钮显示“导出 N 个”；JPG 禁用透明并强制白底；SVG 隐藏倍数；批量逐个导出；Toast 从纯字符串改为 `{title, detail}`，JPG/SVG/批量各自显示真实结果与目录。
- 紧凑弹窗：卡片改为纵向 flex，正文 `.export-body` 可滚动、操作区固定在底部；`max-height:760px` 下压缩间距、格式与倍数卡改单行；导出按钮不再被 1040×680 窗口裁掉。
- 顶栏“版本”按钮原本误复用 `.export-btn` 类名，已拆成 `.version-btn`；CSS 组合选择器、禁用态、窄屏规则同步，视觉不变。

**截图自检拦下的问题**

- 1040×680 首版弹窗底部按钮被裁；只加 `max-height` 后仍出现滚动且操作区不可见，改为正文滚动 + 固定操作区后复验完整。
- 批量弹窗首次截图带着上一笔 SVG 导出的旧 Toast；改为在新启动的虚拟桌面应用里截图，最终画面干净。
- 批量时倍数卡写“2 个”含义不清，改为“逐块输出”；范围“当前画板”改为“当前选中”；副标题写“本页 2 个画板/区块”；提示缩短，避免“号。”孤行。
- 全窗口 JPG Toast 有一次 `PrintWindow` 采集被裁/放大，没有直接发给用户；改用 `shot.ps1` 的虚拟桌面 + CDP 链路重截，自检 Toast 路径与画面后才保留。
- 这一轮把截图流程固定为：截图 → 自己先看 → 发现问题先修 → 重截 → 确认无问题再发。

**验收**

- 单元测试：`svg.test.ts` 新增 3 条；`npm run gate` PASS，17 个测试文件 / 90 条测试。
- 构建：`index-CmtcMuiV.css` 52.34 kB、`index-BV-fZg9y.js` 355.25 kB；EXE 3,239 KB，2026-11-23 20:12:41。
- 真实导出：`桌面 1440@2x.jpg` 2880×1800 / 71,481 B；`桌面 1440.svg` 1,016 B；`桌面 1440@2x.png` 2880×1800 / 155,040 B；批量第二块 `画板 2@2x.png` 1200×800 / 37,596 B。SVG 用 Edge 打开，形状、颜色、文字、位置正常。
- UI：`shots/export-batch-final.png` 1440 批量导出弹窗，本页全部选中、无旧 Toast；`shots/export-compact-final.png` 1040×680 紧凑弹窗，格式/范围/倍数/提示/取消/导出按钮均完整；`shots/export-jpg-toast-final.png` 最终 EXE 的 JPG Toast，路径与白底导出正常；`shots/svg-preview.png` 是实际 SVG 导出文件的浏览器预览。
- 自检结论：以上四张图逐张看过；批量与紧凑弹窗无裁切、无溢出；Toast 无残留、路径不是假路径；SVG 预览无缺字/错位。

**这轮边界**

- 批量是逐个文件写 `exports`，不打包 ZIP；没有“选择保存目录 / 文件对话框”，没有 JPG 质量滑杆。
- SVG 只覆盖当前基础节点（rect / ellipse / text / frame / section / group），不支持图片填充、阴影、混合模式、蒙版、组件实例；Frame 子边框是近似绘制，不是完整 CSS / 滤镜级保真。
- 批量失败时逐个 Toast 汇总，不做“部分成功”文件清单；重名自动编号，用户不能指定基名。
- Section 的 JPG/SVG 与批量组合未单独实拍；当前实拍覆盖普通 Frame 的 JPG/SVG 和 PNG 批量。

## A08 导出交接：PNG/JPG → Strata，SVG → Vexa（第一版，入口已拆）

> 2026-11-24 起，导出弹窗不再提供“导出后打开 Strata/Vexa”。这一节保留为底层启动与 Vexa 接收端的实现记录；新的入口只从“选中元素/框选区域”发起，等选区回传接收层接入后再开。下面提到的 `handoff` 复选框已从 UI 删除。

不是把三种格式同时塞给两个软件，而是按格式固定分工：位图进 Strata 精修，矢量进 Vexa 编辑；批量不做交接，因为一个目标应用一次只适合接一个文件。

**工程链路**

- `src/io/handoff.ts`：`handoffTargetForFormat()` 固定映射（png/jpg/jpeg → strata，svg → vexa）；`openExportInApp()` 调 Tauri `groma_open_in_app`，返回真实 target/exe/file。
- `ExportDialog.tsx`：新增 `handoff` 状态与 `.export-handoff` 复选框；文案随格式变化“导出后打开 Strata / Vexa”，描述“PNG/JPG 位图精修 / SVG 矢量编辑”；批量时禁用并写“批量不支持外部应用”；勾选后主按钮变“导出并打开”；导出成功但启动失败时 Toast 分开写“已导出 · 未找到 Strata / 未启动”，文件路径仍如实返回。
- `src-tauri/src/main.rs`：新增 `HandoffInfo`、`find_handoff_exe()` 与 `groma_open_in_app(target, file)`；目标与扩展名二次校验（Strata 只接 png/jpg/jpeg，Vexa 只接 svg）；应用发现优先 `GROMA_STRATA_EXE` / `STRATA_EXE`、`GROMA_VEXA_EXE` / `VEXA_EXE`，其次从当前 EXE 向上 8 层找 `Strata/Strata.exe`、`Strata/src-tauri/target/release/strata.exe`、`Vexa/release/Vexa.exe`、`Vexa/src-tauri/target/release/vexa.exe`，再查 `%LOCALAPPDATA%\Programs`、`%PROGRAMFILES%` 与 `PATH`；`Command::new(exe).arg(file)` 启动，Windows 加 `CREATE_NO_WINDOW`。
- Vexa 接收端：`src-tauri/Cargo.toml` 加 `tauri-plugin-single-instance`；`lib.rs` 增加 `launch_intent`、只接 `.svg`/`.vex` 的 `pick_launch_path()`、单实例 emit `vexa://launch-open` 并聚焦主窗口；`src/core/launch.ts` 读启动意图 / 订阅事件；`src/core/svg.ts` 增加 `svgIntrinsicSize()`；`App.tsx` 启动读 intent，`.svg` 走 `importSvgLaunch()`，用 SVG 的 viewBox/width/height 建同尺寸文档并导入节点，不写 recent 列表。

**验证**

- `npm run gate` PASS：18 个测试文件 / 92 条测试（新增 `handoff.test.ts` 2 条）；前端 `index-BJMi-EgH.css` 52.37 kB、`index-hc9Hzll9.js` 356.37 kB；EXE 3,247 KB，2026-11-23 20:35:11。
- Vexa `cargo check` 与 `npm run tauri:build` 通过；新 `vexa.exe` 7,782,400 B / 2026-11-23 20:33:27，已同步 `release/Vexa.exe`。NSIS 打包阶段被占用文件挡住，但 raw EXE 已产出并替换，不影响本机交接。
- 真实 Groma→Strata：JPG 勾选交接，Toast `JPG 已导出 · Strata 已打开`，路径 `...\exports\桌面 1440@2x.jpg`；随后用同一文件启动 Strata，窗口标题 `桌面 1440@2x`，画布显示 2,880×1,800 位图。
- 真实 Groma→Vexa：SVG 勾选交接，Toast `SVG 已导出 · Vexa 已打开`，路径 `...\exports\桌面 1440-2.svg`；Vexa 新进程启动，直接以该 SVG 启动时标题 `桌面 1440 · Vexa`，画板 1,440×900，显示矩形、椭圆、标题文字与副标题；单实例第二进程带 SVG 启动时第一进程收到并替换为同一文档，证明“已开 Vexa 再交接”也能接收。
- 端到端复核：用 `shot.ps1 -CaptureProcess Strata/Vexa -CaptureOut ...` 在同一虚拟桌面里截到交接后的接收端窗口——`strata-from-groma.png` 显示 2,880×1,800、RGB 8 位、1 个背景层；`vexa-from-groma.png` 显示标题 `桌面 1440-3`、画板 1,440×900、矩形/椭圆/两段文字/横条全在，不再是“只启动了进程”。
- UI：`shots/handoff-dialog.png` 1440×900 导出弹窗，SVG + “导出后打开 Vexa”勾选，主按钮“导出并打开”；`shots/handoff-compact.png` 1040×680 紧凑弹窗，交接行完整、操作区无裁切；`shots/handoff-batch.png` 两画板本页全部，交接行置灰并写“批量不支持外部应用”，主按钮“导出 2 个”；`shots/handoff-strata.png` JPG→Strata Toast；`shots/handoff-vexa-final.png` SVG→Vexa Toast；`shots/strata-from-groma.png` 与 `shots/vexa-from-groma.png` 是实际交接后的接收端窗口。以上逐张自检：弹窗无裁切、Toast 路径真实、接收端标题/尺寸/内容对得上。

**这轮边界**

- 交接只对单画板/单区块开放，批量禁用；不把 PNG/JPG 塞给 Vexa，也不把 SVG 塞给 Strata。
- 不写 `.strata` / `.vex` 原生工程，只传导出文件；接收端是否可继续编辑取决于对方格式能力。
- 应用发现路径不在候选里时，靠环境变量或同级目录；找不到如实报“未找到”，不装成功。
- Vexa 已打开文档时收到外部 SVG 会替换当前文档，没有未保存确认；这是当前实现边界，后续如做多标签/脏检查再补。


## A08 导出弹窗重排：拆掉“导出即打开外部应用”（2026-11-24 07:11）

**为什么改**

上一版把“导出文件”和“继续编辑”塞进同一个弹窗：导出格式、范围、倍数、透明、外部软件五个选择都用黄色描边，视觉焦点散；最后还多一个“导出后打开 Strata / Vexa”复选框，像设置面板，不像一个干净交付动作。用户明确要求：默认一站式，只有选中素材/元素在 Groma 处理不了时才去外部软件，处理完带回原位；不要把外部软件做成导出选项。

**改法**

- `ExportDialog.tsx`：删除 `handoff` 状态、`openExportInApp` 调用和交接复选框；导出只做导出。
- 三张大格式卡改成一条分段控件：PNG / JPG / SVG；下方一行说明当前格式能力。
- 范围也改成分段控件，仅多画板时出现；倍数与输出尺寸同排，透明背景改成右侧开关；底部集中显示 `格式 · 倍数 · 输出尺寸` 与“写入 exports · 重名自动编号”。
- 焦点只留主按钮；“取消/导出”固定底部；1040×680 两画板批量时压缩段间距、隐藏透明说明，所有内容与按钮一屏可见。
- `handoff.ts`、`groma_open_in_app`、Vexa 带文件启动/单实例接收保留，不删底层；等“选中元素/框选区域 → 外部处理 → 带回原位”的接收层接入后再开新入口。

**验证**

- `npm run gate` PASS：18 个测试文件 / 92 条测试；最终 EXE 3,248 KB，2026-11-24 07:11:49。
- 真实 EXE 单张导出：Toast `PNG 已导出`，路径 `...\exports\桌面 1440@2x-3.png`；文件生成后已清理，自检工程只剩原有两张 PNG。
- 真实 EXE 批量导出：两画板“本页全部”，Toast `已导出 2 个文件`，目录 `...\交接批次.groma\exports`；`桌面 1440@2x-3.png` 154,997 B、`画板 2@2x.png` 105,602 B；临时工程与导出文件已删除。
- UI：`shots/export-clean-1440.png` 1440×900 单画板 PNG；`shots/export-clean-1040.png` 1040×680 单画板 JPG（透明开关置灰、底部完整）；`shots/export-clean-batch-1040.png` 1040×680 两画板“本页全部”，范围行、2 个文件摘要、主按钮全部可见；`shots/export-clean-toast.png` 单张导出 Toast；`shots/export-clean-batch-toast.png` 批量导出 Toast。以上逐张看过：没有裁切、没有滚动条压住按钮、没有旧 Toast；1040 两画板批量是最紧状态。

**边界**

- 这轮只改导出 UI 与入口边界；真正的选区回传、图片资产层、Strata/Vexa 写回 Groma 尚未实现，不能把“底层启动命令还在”说成“回传已打通”。
- 导出仍固定写工程 `exports`，重名自动编号；不做保存目录对话框、ZIP 打包、JPG 质量滑杆。

## 图片资产层与位图节点（2026-11-24 07:54）

**为什么做**

Figma 基线里的 C06 图片还只有 SVG 内嵌图，没有可独立选中的位图节点：本地 PNG/JPG 进不来，工程 `assets` 只是空的占位目录。先把「图片进得来、能改、能存、能导出」这一垂直切片做通，后面 Strata 位图回传、Vexa 工程往返和选区外部处理才有落点。工程级导入仍只留入口，这轮不碰。

**改法**

- 数据模型：`NodeType` 增加 `image`；`SceneNode` 增加 `assetId`；新增 `ImageAsset { id, name, mime, file, w, h, bytes }` 与 `GromaDoc.assets`；`scene.json` 只存资产引用，图片本体在 `<工程>/assets`。
- 校验：`schema.ts` 只接受 `image/png`、`image/jpeg`、`image/webp`；资产路径必须是 `assets/<文件名>`，拒绝 `..`、反斜杠和越界路径；图片节点缺 `assetId` 或引用不存在直接拒绝工程。
- Rust：新增 `groma_write_asset` / `groma_read_asset`，校验扩展名、MIME、PNG/JPEG/WebP 文件头与 64MB 上限，重名自动编号；读回统一转 data URL。
- 前端缓存：`src/io/images.ts` 按 `asset.id` 缓存图片位图与 data URL，打开工程/新建工程触发 hydrate；画布与页缩略图订阅加载完成重绘，缺图显示占位不崩。
- 导入：顶栏“导入”接受 `.svg/.png/.jpg/.jpeg/.webp`；位图按自然尺寸插入，并限制到父容器 80%，优先挂当前选中画板/区块，否则落到视口中心画板，保证默认导出画板能带上图片。
- 检查器：右侧显示文件名、原始尺寸、文件大小、X/Y/W/H、圆角、透明度与“恢复原比例”；“替换图片”用隐藏文件输入换图，保留节点位置与尺寸，默认图层名随新文件更新，自定义图层名保留；图层树和类型标签显示“图片”。
- 渲染/导出：`drawImageNode` 支持圆角裁切、透明度、缺图占位；SVG 导出内嵌 `data:image/...;base64`，有圆角时套 `clipPath`；PNG/JPG 导出前预载资产。
- 紧凑窗口：`@media (max-height: 760px)` 压缩检查器段距、字段高与提示留白，1040×680 下“恢复原比例”按钮不再被底部裁掉。

**验证**

- `npm run gate` PASS：18 个测试文件 / 99 条测试；前端 `index-CVV6Mwc-.css` 54.02 kB、`index-B-tjo4tv.js` 395.83 kB；EXE 3,270 KB，2026-11-24 08:06:53。
- 真实 EXE：在 `图片资产验收.groma` 导入 `image-layer-source.png`（480×320、4,608 B），Toast 显示文件名与尺寸；图片节点成为 `桌面 1440` 子节点，x=480 / y=290 / w=480 / h=320；保存后 `scene.json` 含 `assets` 表与 `type:"image"`，资产文件落在 `assets/image-layer-source.png`。
- 导出：真实 PNG `桌面 1440@2x-3.png` 177,492 B，打开可见导入图片；SVG `桌面 1440.svg` 7,308 B，包含 `<image` 与 `data:image/png;base64`。
- 替换：在新建的 `图片替换验收.groma` 先导入 `image-layer-source.png`，再在检查器替换为 `image-replace-source.png`；文件行、图层名与 Toast 之外的检查器状态都切到新文件，节点 x=480 / y=290 / w=480 / h=320 不变，保存重开仍指向新资产。
- UI：`shots/image-import.png` 1440×900 导入后图片在画板内、右侧图片检查器与 Toast；`shots/image-inspector-1040.png` 1040×680 紧凑检查器，恢复/替换两个按钮完整；`shots/image-replace.png` 真实替换后的检查器与图层名；`shots/image-replace-reopen.png` 替换后保存重开仍指向新资产；`shots/image-reopen-final.png` 关闭重开工程后图片随画板恢复；`shots/image-export.png` / `image-svg-export.png` 为真实导出 Toast。逐张自检，无横向溢出，Toast 不长期遮挡。
- 回归：`schema.test.ts` 新增合法资产、缺资产引用、非法路径/格式 3 条；`editor.test.ts` 新增插入/撤销/比例/默认落画板/替换 5 条；`svg.test.ts` 新增图片内嵌 1 条。

**边界**

- 图片是独立节点，不是矩形的图片填充；无裁剪焦点、粘贴图片、删除后孤儿资产清理，也没有拖放导入。替换图片保留位置尺寸，不自动裁到新图比例，需要用户再点“恢复原比例”。
- 1040×680 检查器只保证主操作可见，外观区仍在右栏滚动范围内；后续如需一屏全见，应把图片元信息收成一行。
- 工程级导入（Groma 工程送进 Strata/Vexa 或反向）只保留入口，未做格式互转；这轮没有把外部软件重新挂回导出弹窗。

## C07 文本样式补全：对齐、行高、斜体（2026-11-24 13:14）

**为什么做**

画布和 SVG 生成器早就支持 `align`、`lineHeight`、`italic`，但右侧检查器只暴露字号和字重，用户看得到效果却改不了。补齐这几个已有字段，比新开一套富文本模型风险小，也能让文本从“能写”变成“能排版”。

**改法**

- 文本区块新增三个对齐按钮（左/中/右），复用现有对象对齐图标，选中态用品牌黄描边和浅黄底；按钮带 `aria-label` 与 `aria-pressed`。
- 新增“行高”数字输入，范围 0.8–3，默认 1.3；新增“斜体”开关，写回 `italic`，渲染与 SVG 已有支持。
- 修复撤销可选字段的底层问题：`applyEntry` 现在把“目标中没有、旧状态中有”的键显式补成 `undefined`，否则给节点新加 `align / lineHeight / italic` 后撤销只会回到旧值，键本身仍留在节点上。
- 1040×680 下对齐按钮与斜体开关跟随检查器紧凑高度（30px），右栏可滚动，不横向溢出。

**验证**

- `npm run gate` PASS：18 个测试文件 / 100 条测试；前端 `index-BvLJdBmk.css` 54.91 kB、`index-CWxZk0UB.js` 397.29 kB；EXE 3,271 KB，2026-11-24 13:14:05。
- 新增 1 条 `editor.test.ts`：写入 `align: center / lineHeight: 1.6 / italic: true` 后撤销，三个可选字段全部回到未设置状态，证明底层补丁撤销修复有效。
- 真实 EXE：在 `文字样式验收.groma` 选中“标题”，点“居中对齐”、行高改 1.6、开斜体；画布文字居中并变斜，检查器三个控件同步为选中态；保存重开后样式仍在。
- UI：`shots/text-style-1440.png` 1440×900 三项控件与画布效果；`shots/text-style-1040.png` 1040×680 紧凑右栏，字号/字重/对齐/行高/斜体不裁切，填充与描边在滚动区下方。
- 回归：`editor.test.ts` 从 24 条增至 25 条；完整套件 100 条全绿。

**边界**

- 字体族、字距、段前段后、列表、富文本区间样式、路径文字、链接仍未做；一个文本节点仍只有一种样式。
- 文本对齐是节点内对齐，不改变节点 X/Y；行高影响多行间距，不自动撑高节点。
- 1040×680 右栏仍需滚动才能看到填充/描边/外观，这是面板内容多于窗口高度的既有边界，不是本轮新增裁切。

## C02 直线工具（2026-11-24 14:00）

**为什么做**

矩阵 C02 的基础形状里，Frame/矩形/椭圆/文字已经有入口，直线还缺。路径渲染、SVG 导出、描边检查器都已存在，先补直线比新造多边形/星形风险小，也能把“拖一下就有一条线”这条高频动作补上。

**改法**

- `Tool` 增加 `line`，顶栏在椭圆后加入斜线图标，`L` 快捷键等价；画布拖动时显示黄线预览，松手回到选择工具。
- `addNode` 增加 `path` 输入：写 `pathData / pathW / pathH / strokes`，默认 `fills: []`、`#221C00` 2px 尖角描边，默认图层名“直线 N”。
- 新增 `src/core/line.ts`：把拖拽起止点归一到包围盒，生成局部 `M…L…`；右下/左上方向都落在 `x/y/w/h` 内，水平/垂直保持 1px 厚度；距离小于 3px 时兜底 120×80。
- 复用现有 path 渲染与 SVG 导出，不新增第二套直线图元；选中后可移动、角点缩放、改描边。

**验证**

- `npm run gate` PASS：21 个测试文件 / 115 条测试；前端 `index-DvX03g4F.css` 57.86 kB、`index-FHX0-PY9.js` 410.50 kB；MCP selftest 通过；EXE 3,278 KB，2026-11-24 14:00:25。
- 新增 `line.test.ts` 4 条：右下、左上、水平/垂直、单击兜底；`editor.test.ts` 再增 1 条 path 落盘、默认无填充与 2px 描边、撤销删除。
- 真实 EXE：在 `line-final.groma` 的 `桌面 1440` 内从画布拖出 `直线 1`，检查器显示 W=612.19 / H=496.68；保存后 `scene.json` 写入 `pathData:"M 0 0 L 612.19 496.68"`、`fills:[]`、2px 描边；关闭重开直线恢复。
- UI：`shots/line-final-1440.png` 拖动创建后的画布、图层树与检查器；`shots/line-final-reopen-1440.png` 保存重开；`shots/line-final-1280.png` 1280×800 顶栏与画布；`shots/line-final-1040.png` 1040×680 顶栏直线入口仍可见，无横向溢出。逐张自检，直线预览不残留，选中框与线端一致。

**边界**

- 直线只有两个端点，没有锚点编辑、箭头端点或直线专属虚线/端帽控件；检查器仍走通用描边。
- 多边形、星形、三角形、箭头、Slice 未做，C02 仍是部分完成。
- 1040×680 画布本身会被左右栏夹窄，这是既有三栏布局边界，不是本轮新增裁切。

## C02 多边形 / 星形与侧边栏交界修正（2026-11-24 19:11）

**为什么做**

直线落地后，C02 还缺多边形和星形；同时用户指出第一张截图左栏“浅色和下面颜色交界”处疑似溢出。DOM 几何审计没有发现左栏子元素越界，问题更可能是图层滚动内容/浮层阴影在 footer 透明背景上渗出；同轮还发现根级 path 被误计入“画板”数量。

**改法**

- 新增 `src/core/shapes.ts`：`polygonPath / starPath / shapePath`；边数/角数 3–12，星形内径 0.1–0.9、默认 0.38，闭合路径，首顶点在正上方。
- `SceneNode` 增加 `shapeKind / shapeSides / shapeInnerRatio`，`schema.ts` 做范围校验；`addNode` 的 path 分支接收形状参数，path 仅在传入 `fill` 时生成默认填充。
- 画布新增多边形/星形拖建，顶栏图标在直线后，快捷键 `G` / `Y`；松手生成 5 边/5 角，尺寸过小兜底 120×120。
- 检查器新增“形状”段：多边形显示边数，星形显示角数与内径%；`setShapeParams` 按当前 W/H 重算路径并只记一条撤销。
- 左栏与右栏加 `overflow:hidden`；`.panel-foot` 改为实底 `var(--bg-app)`、`position:relative`、`z-index:1`，把滚动内容与浮层阴影挡在 footer 上方。
- 页行计数与底栏“画板”改为只统计 `type==='frame'` 的根子节点，避免画板外创建的 path 被算成画板。
- 画布底部提示 `.canvas-tip` 加单行省略与最大宽度，1040 不再换成两行盖住画布。

**验证**

- `npm run gate` PASS：22 个测试文件 / 124 条测试；MCP selftest 通过；前端 `index-DId1aIH6.css` 58.03 kB、`index-CQbD3jSw.js` 415.12 kB；EXE 3,279 KB，2026-11-24 19:16:02。
- 回归：`shapes.test.ts` 4 条、`schema.test.ts` 1 条越界校验、`svg.test.ts` 1 条两形状闭合路径导出、`editor.test.ts` 1 条参数化落盘/默认填充/改边数撤销。
- 真实 EXE：`shape-final.groma` 在 `桌面 1440` 内拖出五边形与五角星，检查器改八边形/内径 55%，保存后 `scene.json` 两节点都挂在 `frame-1`，`shapeSides:8`、`shapeInnerRatio:0.55`、`fills:#D9D9D9`、`strokes:[]`；重开八边形与五角星恢复。
- 截图：`shots/shapes-1440.png` 绘制与参数修改后的画布/图层树/星形检查器；`shots/shapes-reopen-1440.png` 保存重开；`shots/shapes-final-1440.png` / `shapes-final-1280.png` 两档完整窗口；`shots/shapes-1040-inspector.png` 1040×680 星形检查器。逐张自检：左栏底栏与状态栏交界为单条实线、无颜色渗出，页行与底栏都显示 `1 个画板`，8 个图层统计正确；1040 提示条单行省略，未盖住画布主体。

**边界**

- 多边形/星形没有独立旋转角、圆角或描边快捷控件，仍走通用填充/描边检查器；三角形只能用多边形 3 边生成，没有独立图标。
- 箭头、Slice、钢笔锚点编辑未做，C02 仍未完成；1040 三栏画布会被夹窄，是既有布局边界，不是本轮新裁切。

## C02 箭头工具与紧凑顶栏重排（2026-11-24 20:07）

**为什么做**

C02 形状还缺箭头。路径渲染、描边检查器和 SVG 导出都成熟，补箭头只用线身 + 单色三角头即可，不必新造第二套矢量模型。加入第 11 个工具入口后，1040 窗口的中央工具条会压到左侧文件名，因此同轮重排紧凑顶栏。

**改法**

- 新增 `src/core/arrow.ts`：把拖拽起止点转成线身 `pathData` 与三角头 `arrowHeadData`；头长 8–24 随线长变化，两翼一起算进包围盒，保证选中框包住箭头。
- `SceneNode` 增加 `arrowHeadData`，`shapeKind` 扩展 `arrow`；`schema.ts` 校验箭头头部路径非空。
- `Tool` 增加 `arrow`，顶栏在直线后加入箭头图标，`A` 快捷键；拖动显示线预览，松手生成“箭头 N”，默认 `#221C00` 2px 描边、无填充。
- 画布 `drawVectorPath` 在线身描边后用描边色填充三角头；SVG 输出第二条 `<path>`，颜色/透明度跟随描边。
- 检查器对箭头不显示“边数/角数”，`setShapeParams` 拒绝箭头，避免把三角头改成多边形路径。
- 紧凑顶栏：`@media (max-width: 900px)` 下文件名宽度从 180px 收到 120px、左侧间距 6→4px；1040 下文件名省略，工具条与撤销/缩放区不再重叠。

**验证**

- `npm run gate` PASS：23 个测试文件 / 131 条测试；MCP selftest 通过；前端 `index-D5Mcvg9K.css` 58.03 kB、`index-SzBigaRI.js` 417.06 kB；EXE 3,280 KB，2026-11-24 20:07:18。
- 回归：`arrow.test.ts` 4 条（水平包围盒、斜向尖端重合、单击兜底、头长夹取），`schema.test.ts` +1 条箭头头部校验，`svg.test.ts` +1 条箭头双 path 导出，`editor.test.ts` +1 条箭头落盘/默认描边/拒绝改边数。
- 真实 EXE：`arrow-final.groma` 在 `桌面 1440` 内拖出斜向与近水平两支箭头，`scene.json` 均为 `frame-1` 子节点，`pathData` 是两点线身、`arrowHeadData` 是闭合三角、`fills:[]`、2px `#221C00` 描边；保存重开后方向与头部完整。
- UI：`shots/arrow-final-1440.png` 两支箭头、箭头 2 检查器与顶栏箭头入口；`shots/arrow-reopen-1440.png` 保存重开；`shots/arrow-final-1280.png` 1280×800；`shots/arrow-1040.png` 1040×680，文件名省略、工具条不重叠。逐张自检，三角头随描边色，选中框包住头部，无横向溢出。

**边界**

- 箭头是直线段 + 单色三角头，不支持曲线箭头、双头箭头、端点样式（空心/菱形）或箭头大小单独控制；箭头仍走通用描边检查器。
- 1040 画布仍被左右栏夹窄，页面只显示局部；这是三栏布局既有边界。
- C02 只剩 Slice；三角形继续用多边形 3 边生成。

## C02 Slice 切片导出与紧凑顶栏收口（2026-11-24 20:57）

**为什么做**

C02 最后一项是 Slice。Groma 已有完整的 PNG/JPG/SVG 导出链路，切片只需作为“导出区域标注”存在：不引入第二套渲染模型，导出时按矩形重绘并裁切。加入第 12 个顶栏入口后，1040 下工具分组竖线仍占宽，文件名被挤成 `Grom`，同轮收口。

**改法**

- `NodeType / Tool` 增加 `slice`；顶栏在星形与文本之间加虚线切片图标，`K` 快捷键。拖出的切片挂到最深画板，名称“切片 N”，`fills:[]`、`children:[]`、不裁剪，宽或高不足兜底 `160×120`，不进入画板计数。
- 画布 `drawSlice`：青色虚线框、极淡青底、左上角白底标签；用专用 `exporting` 标志控制，编辑器常态始终显示，导出时隐藏。最初用 `interactive` 判断，真实截图发现松手后虚线消失，已改掉。
- 导出：新增 `pageRootOf / renderSliceRaster / Png / Jpg / Svg`。位图从页面根重绘，画布平移到切片零点并按矩形裁切；SVG 以切片尺寸建 `width/height` 与 `viewBox`，套独立 `groma-slice-export` clipPath；切片自身不输出。普通画板、区块导出与缩略图同样隐藏切片标注。
- 检查器：切片类型标签、`SliceInspector`，提供 X/Y/W/H 与“导出区域”说明；页面检查器改用 `countArtboards`，根级切片不会被算成画板。
- 导出弹窗：选中切片作为独立目标，页面批量目标接受顶层切片；文案补切片，SVG 摘要显示 `1× · 527 × 497`。
- 紧凑顶栏：`@media (max-width: 900px)` 隐藏 `.tool-sep`，把宽度还给文件名；1040 下 12 个入口完整、标题恢复为 `Groma`、无重叠。

**修掉的真实缺陷**

- 切片虚线只在拖拽时出现：`interactive=false` 时被跳过，改为只在 `exporting` 时跳过。
- SVG 居中文本左移出画：父级 `x` 虽已按文本框中心计算，但每行 `<tspan>` 仍写旧左边界，覆盖父级锚点；改为 `tspan` 同步使用 `textX`，测试补 `tspan x="70"` 断言。
- 打开工程误传完整路径：`--open` 只接受工程 id，改传 `slice-final`；重开时画板图层默认折叠，CDP 选择切片前先展开 `.layer-caret`。

**验证**

- `npm run gate` PASS：23 个测试文件 / 135 条测试；MCP selftest 通过；前端 `index-CPsLA2Dx.css` 58.03 kB、`index-BTAErJ2y.js` 422.13 kB；EXE 3,281 KB，2026-11-24 20:57:07。
- 真实 EXE：`slice-final.groma` 中 `slice-mwuomxf8-1` 为 X443/Y182/527×497，保存重开虚线、标签、检查器恢复，状态栏仍“1 个画板”。
- 导出实测：PNG `切片 1@1x.png` 527×497 / 14,235 B，无虚线无标签；SVG `切片 1.svg` 1,278 B、`viewBox="0 0 527 497"`，Edge headless 渲染与 PNG 的卡片右缘、墨色圆、标题尾“oma”、副标题残段、横条一致。
- UI：`shots/slice-reopen-1440.png`、`slice-export-dialog-1440.png`、`slice-final-export-1440.png`、`slice-compact-1040.png`；逐张自检，1440 顶栏 12 入口与文件名不互压，1040 标题完整，右栏切片字段完整。

**边界**

- 切片只支持单个矩形；批量切片网格、嵌套切片全部参与本页批量导出未做。
- 1040×680 三栏画布仍偏窄，切片右侧会被右栏遮住，需平移查看；这是既有布局边界。

## C03 钢笔/矢量路径一期与单图层导出（2026-11-24 21:42）

**为什么做**

Figma 能力矩阵里 C03 仍写着“渲染器尚无矢量节点”，但组件、图标、布尔、蒙版都压在矢量对象模型上。这一刀只做一条能验收的钢笔链路：入口 → 放锚点/拖手柄 → 闭合或收尾 → 真实 path 节点 → 保存重开 → 导出；锚点增删、分支路径明确留到下一刀。

**改法**

- 新增 `src/core/pen.ts`：`PenAnchor` 用世界坐标，`PathAnchor` 用节点局部坐标；相邻锚点任一有手柄时输出三次贝塞尔 `C`，否则 `L`，闭合补末段并加 `Z`；`penGeometry` 把手柄计入包围盒，输出节点 `x/y/w/h`、`pathData`、`pathW/H`、局部锚点与 `closed`；少于 2 锚点无效，闭合不足 3 锚点降级为开放。
- `SceneNode` 加 `pathAnchors/pathClosed`；schema 校验至少 2 锚点、六个字段有限数字、`pathClosed` 布尔。钢笔节点继续是 `type:'path'`，靠 `pathAnchors` 判定，旧直线/箭头/多边形不受影响。
- `Tool` 加 `pen`；`P` 快捷键；顶栏在星形与切片之间加钢笔图标；左栏与右栏类型统一为“钢笔”，检查器显示锚点数与开放/闭合。
- 画布钢笔会话：首击定父画板，之后点击加锚点、拖动生成对称手柄；点首点（≥3 锚点、≤8px）闭合；靠近末锚点 420ms 内再按视为双击收尾；`Enter/Escape` 捕获阶段收尾；切工具自动收尾。收尾后选中新节点并切回移动工具。闭合默认浅灰填充无描边，开放默认墨色 2px 描边。
- `pen-overlay` SVG：品牌黄虚线预览、白底锚点、首锚实心黄、灰手柄线与圆点；选中钢笔且工具为钢笔时显示；节点缩放按 `w/pathW`、`h/pathH` 映射锚点。
- 单图层导出：新增 `renderNodePng / renderNodeSvg`，选中任意非页面图层时以自身包围盒为零点；`ExportDialog` 的 `pickTarget` 不再把钢笔/形状上溯到父画板，标题显示“图层 · 钢笔 1”。画板/区块/切片继续走原专用导出。
- 紧凑顶栏：13 个工具入口在 1440 物理窗口（CSS viewport 946、DPR 1.5）把工程名压到工具条下；把紧凑规则从 `max-width:900px` 上移到 `1180px`，工具 28→23px、隐藏 `.tool-sep`、隐藏导入/版本文字、工程名 `min-width:0`。修复后 `.topbar-left` 右界 294 与 `.topbar-tools` 左界 294 对齐，工程名 x101–221 完整。

**修掉的真实缺陷**

- 顶栏第 13 个入口压字：CSS viewport 946 下 `1fr auto 1fr` 的中心列涨到 470，左栏只剩 120；断点上移后复测无重叠。
- 选中钢笔导出仍导出父画板：弹窗最初显示“画板 · 桌面 1440”，实际导出 1440×900 整图；补 `renderNodePng/Svg` 与通用 `pickTarget` 后，弹窗变为“图层 · 钢笔 1”、377×427。

**验证**

- `npm run gate` PASS：24 个测试文件 / 142 条测试；MCP selftest 通过；前端 `index-CH1qqibQ.css` 58.40 kB、`index-DLuSIfC-.js` 430.08 kB；EXE 3,283 KB，2026-11-24 21:42:32。
- 新增 `pen.test.ts` 4 条；`schema.test.ts` 15 条（+1 锚点校验）；`editor.test.ts` 30 条（+1 钢笔落盘/撤销）；`svg.test.ts` 9 条（+1 单图层钢笔 SVG 零点）。
- 真实 EXE：`pen-final.groma` 在 `桌面 1440` 画出 `钢笔 1`（闭合、5 锚点、`#D9D9D9` 填充、无描边、377.33×427.38）与 `钢笔 2`（开放、4 锚点、无填充、2px 墨色描边、296.47×369.63）；保存重开后图层、锚点叠层与检查器均恢复。
- 导出实测：`钢笔 1@1x.png` 377×427 白底位图；`钢笔 1.svg` 471 B、`viewBox="0 0 377.33 427.38"`，Edge 渲染与 PNG 轮廓一致；开放路径 `钢笔 2@1x.png` 296×370，仅开放线身。
- UI：`shots/pen-create-1440.png`（两条路径、选中钢笔、5 个锚点/10 个手柄点、检查器闭合）、`pen-reopen-1440.png`（重开）、`pen-reopen-1280.png` / `pen-reopen-1040.png`（紧凑窗口 13 入口无重叠）、`pen-export-dialog-1440.png`（图层目标 377×427）、`pen-export-png-1440.png`（PNG Toast）、`pen-export-open-1440.png`（开放路径导出）、`topbar-pen-probe2.png`（修复后顶栏）。

**边界**

- 一期当时边界：锚点只读展示，不能拖手柄改形、增删锚点或拆分路径；只做单条连续路径，分支/多路径矢量网络未做。锚点编辑在下一节补齐。
- 钢笔工具默认填充/描边暂不记忆；1040×680 下工程名省略为“钢…”，画布仍被三栏夹窄。
- 未做 JPG 钢笔导出与 2× 钢笔导出复验；未做透明背景钢笔导出截图。

## C03 钢笔锚点编辑与全屏最大化验收（2026-11-24 22:28）

**为什么做**

钢笔一期能画能存，但锚点只是只读标记，画错了只能删整条路径重画，不算可用的矢量编辑。这一刀把锚点补成可编辑：拖锚点改形、拖手柄调曲线、在线段上加点、选中后 `Delete` 删点；同时按用户要求改验收口径，生产力软件必须铺满屏幕再截图，不再用小窗口判断 UI。

**改法**

- 新增 `nearestOnPenPath`：直线段投影，贝塞尔段 32 段采样，返回最近段、`t`、落点与距离；`insertPenAnchor` 用 De Casteljau 在 `t` 处切分并改写两端手柄，插点不改变原曲线形状；直线段插无手柄角点；`removePenAnchor` 少于 2 锚点拒绝删除；`pathAnchorsToWorld` 按 `w/pathW`、`h/pathH` 还原缩放后的世界坐标。
- `editor.setPathAnchors(id, anchors, closed, silent)` 统一重算几何、节点包围盒与 `pathData`。拖动中用 `silent` 连续写、`beginTransaction/endTransaction` 合成一条撤销；插点/删点各写一条历史。
- `CanvasView`：钢笔工具下选中钢笔时，距锚点 ≤7px、手柄 ≤6px 进入编辑；拖锚点整点连同 in/out 手柄平移；拖手柄默认对称、`Alt` 只改单边；点路径段 ≤6px 插点并选中；`Delete/Backspace` 删选中锚点；`Escape` 只清锚点选择。选中锚点加深色描边，底部提示改为“拖动锚点/手柄改形 · 点线段加点 · Delete 删锚点”。
- `tools/shot.ps1` 增加 `-Maximized`：启动后 `ShowWindow(hwnd, 3)` 铺满工作区，等 900ms 再截图；不再手工改 1440×900。

**验证**

- 局部：`pen.test.ts` 7 条、`editor.test.ts` 31 条通过；新增事务断言确认两次静默更新只回退一步。
- 完整 `npm run gate` PASS：24 个测试文件 / 146 条测试；MCP selftest 通过；前端 `index-D--MXBsj.css` 58.48 kB、`index-C_v_y0DE.js` 436.22 kB；EXE 3,284 KB，2026-11-24 22:28:12。
- 真实 EXE（最大化 1707×1019）：`pen-edit.groma` 选中 `钢笔 1`、缩放到 100%；拖动第 3 个锚点后 W/H 从 377.33×427.38 变为 473.33×438.75；拖手柄继续改形；点线段插点，锚点 5→6，`Delete` 后 6→5；保存后 `scene.json` 仍为闭合 5 锚点，重开锚点叠层、检查器与改写后的 `pathData` 全部恢复。
- `Alt` 单边手柄：`pen-alt.groma` 按住 `Alt` 拖 out 手柄，`out` 377.33,296.47→431.33,264.47，`in` 保持 377.33,219.47，W 377.33→431.33；保存重开保持。
- UI：最大化后顶栏 `.topbar-left` 右界 619 = `.topbar-tools` 左界 619，工程名完整，13 个工具入口无重叠；三栏比例舒展、画布占主要宽度，锚点/手柄不挤。截图 `shots/pen-edit-max.png`、`shots/pen-edit-reopen-max.png`、`shots/pen-alt-max.png` 均为全屏工作区（CSS 1707×1019、物理 2582×1550），不再保留旧的小窗口验收口径。

**边界**

- 仍是单条连续路径；分支路径、多路径 Vector Network 未做。
- 锚点最少 2 个；手柄默认对称、`Alt` 单边，独立断开手柄状态未做。
- 插点按 32 段采样，极限放大时落点精度可能差一个采样步长；缩放后编辑把 `w/pathW` 重置为 1 的视觉跳动尚未专项压测。

## C03 多轮廓复合路径 + 共点分支 + 角点/平滑点（2026-11-24 23:23）

**为什么做**

钢笔和锚点编辑都只能改同一条轮廓；Figma 的钢笔节点可以同时装多条子轮廓，图标、字母、镂空图形都靠它。这一刀不拆成多个图层，而是在同一个钢笔节点里放多条真正可编辑的轮廓，支持同坐标起笔分支，并补上双击锚点切换角点/平滑点。开放轮廓按 Figma 语义只描边，不参与填充。

**改法**

- `PathContour { anchors, closed }` 加进 `SceneNode.pathContours`；单轮廓仍只写旧 `pathAnchors/pathClosed`，多轮廓才写 `pathContours` 并镜像第一条，旧工程照常加载。
- `penContoursGeometry` 让多轮廓共享一个包围盒原点，`pathData` 每条轮廓拼一个 `M`；`pathContoursToWorld` 逐条还原世界坐标。`editor` 统一为 `commitPathContours/setPathContours`，`setPathAnchors` 只替换第一条并保留其他。
- `CanvasView` 的锚点引用从数字升级为 `{ contour, index }`：命中、拖锚点/手柄、线段插点、`Delete` 删点、选中态都按轮廓工作。钢笔下选中节点后，`Alt`+点空白追加一条轮廓，`Alt`+点已有锚点以同一坐标起一条分支，收尾后保持工具与选中。
- 渲染：Canvas 与 SVG 都按轮廓拆绘制，闭合轮廓才填充，开放轮廓固定 `fill="none"`、只吃描边；追加开放分支时若节点没有描边，自动补 2px `#221C00`，避免分支线不可见。
- `togglePenAnchorType` 按前后锚点切线生成共线等长手柄；双击锚点切平滑，再双击回角点。右栏显示“轮廓 N 条”、总锚点与“X 闭合 / Y 开放”，说明加“双击锚点切角/平滑；Alt + 点锚点起分支，Alt + 点空白追加轮廓”。

**验证**

- 局部：`pen.test.ts` 10 条、`schema.test.ts` 15 条、`editor.test.ts` 32 条、`svg.test.ts` 10 条通过。
- 完整 `npm run gate` PASS：24 个测试文件 / 151 条测试；MCP selftest 通过；前端 `index-D--MXBsj.css` 58.48 kB、`index-DRVSHOf4.js` 441.97 kB；EXE 3,286 KB，2026-11-24 23:23:55。
- 多轮廓：`pen-branch.groma` 的 `钢笔 1` 从 1 轮廓/5 锚点扩成 2 轮廓/8 锚点（第一条 5 锚点闭合、第二条 3 锚点开放）；拖第二轮廓首锚点、线段插点 8→9、`Delete` 回 8；保存重开恢复“2 条 / 8 个 / 1 闭合 / 1 开放”。
- 共点分支：`pen-branch-stroke.groma` 在第一轮廓首锚 `Alt`+点起笔，再落两笔；第二条 3 锚点开放、首锚 `(96.26,65.45)` 与第一条首锚完全相同，节点自动补 2px 描边；PNG 605×817 显示闭合填充形状 + 开放黑线；SVG 766 B 两个 `<path>`，闭合路径有 `fill="#D9D9D9"`，开放路径 `fill="none"`，都带 2px 描边。
- 角点/平滑：`pen-anchor-type.groma` 双击第一轮廓第 2 锚点，手柄清零、`H` 668.05→641.10，保存重开仍为角点；再双击还原平滑，`H` 680.53，保存重开保持；驱动脚本 `tools/cdp-pen-type.mjs`。
- UI：`shots/pen-branch-clean-max.png`（共点分支、两轮廓、开放只描边）、`shots/pen-type-final2-max.png`（平滑点与开放轮廓）、`pen-branch-stroke-svg-max.png` / `pen-branch-stroke-png-max.png`。顶栏 `.topbar-left` 右界 619 = `.topbar-tools` 左界 619，13 个入口无重叠；右栏提示与底部提示完整。

**边界**

- 分支只是“相同坐标起笔”的两条独立轮廓，不是共享节点；拖动起点后两支会分开，真正共享节点的 Vector Network 图结构未做。
- 没有独立“删除整条轮廓”菜单；删到只剩 1 个锚点且还有其他轮廓时会自动移除该轮廓。
- 平滑手柄固定等长，未支持断开手柄独立调；工程重命名要同步 `scene.json` 的 `name`，只改 `project.json` 顶栏不刷新。

## C03 共享顶点与整条轮廓删除（2026-11-25 07:50）

**为什么做**

上一节的分支只是同坐标起笔，拖起点就散；Figma 的钢笔节点需要真正的共享节点，才能让分支跟随、删点同步。同时多轮廓之后右栏只知道“有 3 条”，不知道当前在第几条，也没有整条轮廓删除入口。

**改法**

- `PathAnchor` / `PenAnchor` 加可选 `vertexId`；同节点重复 id 即共享顶点，旧工程无 id 照旧。schema 只校验非空，不禁止重复。
- `pen.ts` 加 `syncSharedPenVertex`、`removePenVertex`、`countSharedPenVertices`；所有几何/世界坐标/插点/切角路径都保留 id；共享点被删时从每条轮廓移除，某条不足 2 锚点整条移除。
- Canvas 普通落点/插点分配新 id；`Alt` 点已有锚点起分支复用 id，旧锚点无 id 先静默补齐；拖点/拖手柄、双击切角都同步同 id 锚点，整次拖拽仍是一条撤销。
- 新增 `src/state/pen-selection.ts`：Canvas 写当前锚点 `{nodeId, contour, index}`，RightPanel 订阅显示“当前轮廓 第 N / M 条”；有共享顶点时显示“共享顶点 N 个”。
- `Ctrl/Cmd+Delete` 删除当前整条轮廓；只剩 1 条时拒绝并 Toast“至少保留一条轮廓”；成功 Toast“已删除整条轮廓”，走一条历史。

**验证**

- 完整 `npm run gate` PASS：25 个测试文件 / 157 条；MCP selftest 通过；`index-BE5AWfgH.css` 58.73 kB、`index-ByhmZPB3.js` 477.66 kB；EXE 3,296 KB，2026-11-25 07:50:38。
- `pen.test.ts` 12 条、`schema.test.ts` 15 条、`editor.test.ts` 33 条；共享 id 同步、删除共享点、几何保留与空 id 拒绝都有单测。
- `pen-vertex.groma`：3 轮廓 / 11 锚点，共享首锚拖动 `96.26,65.45→177.58,115.93`，闭合与分支同步、独立第二轮廓不动；`scene.json` 两条轮廓首锚共享 `vmwvbs3cp-1`；保存重开仍是 3/11、共享顶点 1。
- `pen-vertex-del.groma`：删共享锚点 11→9，三条轮廓 4/3/2；`pen-vertex-undo.groma` 删除后 `Ctrl+Z` 回 11、共享顶点恢复，保存成功。
- `Ctrl+Delete`：3 轮廓 / 11 锚点→2/6，`Ctrl+Z` 回 3/11，保存状态“已保存”。
- 导出：`钢笔 1-3.svg` 849 B，闭合 `fill="#D9D9D9"`、开放 `fill="none"`、均 2px；`钢笔 1@1x-3.png` 605×817 / 28,924 B。
- UI：`shots/pen-vertex-after-max.png`、`pen-vertex-final-max.png`、`pen-vertex-svg-max.png`、`pen-vertex-png-max.png`、`pen-vertex-delete-max.png`、`pen-vertex-delete-undo-max.png`。右栏“当前轮廓 第 1 / 3 条”“共享顶点 1 个”不挤压检查器，底部提示完整。

**边界**

- 这是最小 `vertexId` 内核，不是完整 `VectorRegion`；没有区域填充、任意图边遍历、跨轮廓拓扑约束。
- `Ctrl+Delete` 只删当前轮廓，不能多选批量删，没有右键菜单入口；删共享点会同时影响所有引用轮廓，这是预期行为。

## C04 两对象布尔 Union / Subtract（2026-11-25 07:50）

**为什么做**

矢量对象模型、共享顶点与多轮廓已经能承载布尔输入；这一刀只做可验证的两对象并集/差集，先把“选两个 → 出一个结果 → 一步撤销 → 存住 → 导出去”跑通，不铺四布尔全套。

**改法**

- 新增 `polygon-clipping@0.15.7`、`src/polygon-clipping.d.ts`、`src/core/boolean.ts`；支持矩形（圆角近似）、椭圆（48 点）、多边形/星形、闭合钢笔路径，贝塞尔固定 12 段 flatten。
- 输入必须正好 2 个唯一对象，对象不得有子图层，至少一条闭合轮廓；开放路径、箭头、文本、图片拒绝。
- 结果新 `path` 节点：每条结果环一条闭合轮廓、`fillRule:"evenodd"`，复制首个对象外观，名称“并集 N / 差集 N”；源对象不动，由 `editor.booleanSelected` 在一条 `structure` 历史里删源+插结果。
- TopBar 选中 ≥2 时显示“并集/差集”；不满足条件禁用，`title` 给具体原因；成功 Toast“并集完成 / 差集完成 · 布尔结果已扁平化为折线”。

**验证**

- `boolean.test.ts` 3 条、`editor.test.ts` 1 条布尔单步撤销；完整 gate 25/157 通过。
- `boolean-union.groma`：两重叠矩形并集“并集 1”，1 轮廓 / 8 锚点 / 646×449 / evenodd；一步撤销回两矩形，重做回结果；保存重开正常。
- `boolean-subtract.groma`：差集“差集 1”，1 轮廓 / 6 锚点 / 407×379，L 形正确；同样单步撤销/重做。
- 导出：`并集 1.svg` 324 B、`差集 1.svg` 304 B；重开工程后再次导出成功。
- 失败态：`pen-final.groma` 两条钢笔含开放路径，按钮禁用，title“并集：需要至少一条闭合路径”“差集：需要至少一条闭合路径”；1280 窗口可视文字“需两条闭合对象”显示，1040 最小窗口收起原因文字、保留 title，顶栏无溢出。
- UI：`shots/boolean-union-max.png`、`boolean-subtract-max.png`、`boolean-union-svg-max.png`、`boolean-subtract-svg-max.png`。1280 顶栏工具条右界 601、可视原因到 601，右侧缩放/导出完整；1040 CSS viewport 679、工具条右界 451、`overflow:0`。后续四按钮与紧凑菜单截图见 C04.2。

**边界**

- 不做 Intersect/Exclude/Divide/Outline/Flatten，不处理 3+ 对象；圆角与椭圆是采样近似，曲线固定 12 段 flatten，结果不可继续编辑曲线。
- 差集以 `selectedIds[0]` 为 subject，尚未按 z-order 归一；反选两个对象会得到相反的差集。按钮文案“从底层对象减去上层对象”与实现仍有口径差，下一刀先修这个。

## C04.2 四布尔 / z-order / 紧凑菜单（2026-11-25 13:16）

**为什么做**

C04 最小布尔只有并集/差集，差集还听点选顺序，与 Figma 的布尔预期不一致；同时四按钮在 1040 最小窗口会挤掉右侧缩放。这一刀把四个布尔补齐，把差集方向改成按图层 z-order，并把窄窗口收成“布尔 ▾”菜单。

**改法**

- `BooleanOp` 扩为 `union | subtract | intersect | exclude`，输出前缀“并集/差集/交集/排除”；`intersect` 用 `intersection`、`exclude` 用 `xor`。
- 新增同父级校验：两个对象必须属于同一父节点，跨 Frame/Group 拒绝，不做隐式提升。
- 新增 `orderByZ`：按父节点 `children` 顺序排序（数组前为底层），`sourceIds` 与几何顺序同步；差集固定“底层减上层”，不再依赖 `selectedIds[0]`。
- TopBar 四按钮走 `BOOLEAN_ACTIONS` 常量；`.bool-wide` 宽屏显示四按钮，CSS `max-width:760px` 隐藏并显示 `.bool-compact`“布尔 ▾”，弹出四操作菜单；点遮罩/Esc/选中变化均关闭。
- `.bool-reason` 隐藏阈值从 760 提到 1180，1280 窗口下左栏恢复 92px、工程名可见、四按钮到 x601；最大化 1707 CSS 下四按钮 + 原因到 x1211，右侧导入/导出仍完整。
- 修正紧凑按钮宽度：`min-width:50px` + `white-space:nowrap`，避免“布尔 ▾”在 34px 按钮里换行；菜单阴影改用实际 `0 12px 28px rgba(34,28,0,.14)`，不再引用未定义 `--shadow-pop`。

**验证**

- `boolean.test.ts` 5 条、`editor.test.ts` 33 条；完整 gate PASS：25 文件 / 159 条，MCP selftest 通过；`index-DNnTPhXM.css` 59.63 kB、`index-Dbvk_VDL.js` 479.35 kB；EXE 3,297 KB，2026-11-25 13:16:26。
- `boolean-four.groma`：交集“交集 1”，1 轮廓 / 4 锚点 / 154×295；`交集 1.svg` 286 B。
- `boolean-exclude.groma`：排除“排除 1”，2 轮廓 / 6+6 锚点 / 646×449；`排除 1.svg` 374 B，两子路径 + `fill-rule="evenodd"`。
- `差集方向验收`：反选两矩形执行差集，仍得底层 矩形1 减上层 矩形2 的 L 形，1 轮廓 / 6 锚点 / 407×379。
- 紧凑菜单：`boolean-compact.groma` 在 1040×680（CSS 679）下菜单四操作均可用，点并集生成“并集 1”，2 轮廓 / 54 锚点 / 520×480，Toast“并集完成”。
- UI：`shots/boolean-four-wide-max.png`、`boolean-four-wide-1280.png`、`boolean-compact-1040.png`、`boolean-compact-union-1040.png`；三档 `overflow:0`。

**边界**

- 仍只支持正好 2 个对象；3+ 对象折叠、Divide、Outline、Flatten 未做。
- 同父级是新增限制；是否允许跨容器布尔需要产品口径。
- 曲线固定 12 段 flatten，结果不可继续编辑曲线。



