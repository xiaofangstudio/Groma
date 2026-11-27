# Groma × Figma 能力矩阵（执行版）

> 更新：2026-11-27 ｜ 审计基线：`npm test` 38 个测试文件 / 234 tests 全绿；D04 已落地四角独立圆角（`cornerRadii` 左上/右上/右下/左下，Canvas/SVG/PNG 与检查器统一，真实 EXE 截图 + 保存重开通过）；D01 已落地同节点最多 16 层填充（纯色/线性/径向、逐层显隐、上下移动，Canvas/SVG 按底层到顶层叠加，右栏“填充 · N 层”）；E01 已落地父 Frame 缩放约束（左/右/居中/左右拉伸/按比例 + 上/下/居中/上下拉伸/按比例，画布与撤销纳入子层）；E02 已落地自动布局一期（Frame/Section/Group 横向/纵向、gap、四边 padding、交叉轴 start/center/end/stretch、主轴 start/center/end/space-between、适应内容主轴；子层按图层顺序，选中子层可在右栏“布局顺序”上移/下移并立即重排，嵌套布局自内向外；拖子层交给布局，改尺寸立即重排，撤销合并父容器与兄弟层）；F04 已落地文档级命名样式（填充/描边/效果/文本四类绑定、同步、解除、删除，右栏显示“已绑定 / 已偏离”，并支持复制变量与导出 CSS/JSON 令牌文件）；C03 已落地钢笔一期/锚点编辑/多轮廓复合路径/共享顶点（`vertexId` 最小内核）/当前轮廓序号与整条轮廓删除，C04 已落地多对象四布尔 Union/Subtract/Intersect/Exclude、同父级校验与 z-order 差集（底层减其余并集），并补齐 Divide / Flatten / Outline stroke；C05 已落地几何形状蒙版与 Alpha/亮度蒙版，多画板画布加入可见区空间索引；C06 已落地图片区域裁剪、剪贴板粘贴与形状图片填充（铺满/适应 + 焦点），C07 已落地字距、段落间距、项目符号/数字列表与字体族建议；D03 已落地多投影与整层模糊（Canvas 离屏效果层 + SVG filter），B02 已补齐 Shift+2 选中适配；百画板总览已改成缩放位图快照 + 低倍/中倍密集画板缩略图 + 独立选中覆盖层 + 增量缩略图 + 建图 12ms 预算 + 左栏行 memo，并加入空闲回调预热（首帧 6 张 / 12ms，空闲片 24 张 / 26ms；600 冷启动 4.2s 内 600 张，500ms 150 张，1 个 >16ms、0 个 >32ms，max 30.9ms）；A02 全链路、A05 浏览回滚与快照 diff、A03 Section 基础链路、A08 PNG/JPG/SVG/HTML 与本页批量导出、选中图层 CSS 检查复制、导出弹窗单焦点重排、页缩略图不抢帧补丁、PNG/JPG/WebP 图片节点与工程资产层（含替换图片）、文本对齐/行高/斜体、C02 直线/箭头/多边形/星形与 Slice 区域导出均已落地；左栏 footer 背景固定与内容裁剪、页面“画板”计数只数 Frame、顶栏宽屏四布尔+“更多 ▾”与窄屏“矢量 ▾”七项菜单、验收截图统一最大化；MCP 19 个 stdio 工具（0.3.3：新增能力查询/单节点精确读/百画板网格/批量改节点/页面改名与背景/四角圆角/多填充/约束/自动布局写入）；外部软件工程级导入只留入口，选区回传待补；EXE 3,399,680 B（3,320 KB），2026-11-27 22:04:01
> 功能底本：[`Figma功能蒸馏参考.md`](./Figma功能蒸馏参考.md)（能力清单，不是完成清单）
> 权威顺序：`README.md` 第零章 → 本文 → 其他规划文档
> 一句话：**Figma 免费版是功能基线，其他工具的长处是融合层；矩阵只认双击 EXE 能跑的结果。**

---

## 0 口径（先定死，避免又做成功能表）

### 0.1 基线

1. **主对标对象是 Figma Design。** 画布、页面/区块/画板、矢量、布尔、文本、填充/描边/效果、约束、Auto Layout、组件/变体/库、样式/变量、原型、Dev Mode，逐项都要有归宿。
2. **“免费对标”指 Groma 不复制 Figma 的套餐分层。** Figma 免费版能用的能力，Groma 不做付费墙；不拿“Figma 免费版限制”当削减功能的理由。
3. **Figma 的其他产品不硬塞进 Groma 主壳。** FigJam、Slides、Sites、Buzz、Draw 的能力保留在矩阵里，但由独立产品/独立模式承接；主编辑器保持“界面设计工作台”这一条窄路，避免 Reelix 式万能面板。
4. **功能清单不等于交付。** 只有通过“入口 → 结果 → 撤销 → 保存重开 → 真实 EXE 截图”五关，状态才写成“已落地”。

### 0.2 融合层

融合不是“Figma 没有就加一个按钮”。进矩阵的条件：

- 确实服务界面设计工作流，而不是另一个产品硬塞进来；
- 有明确的 UI 归宿：右键、上下文栏、属性分组、命令面板、独立服务或独立应用；
- 不抢画布面积、不增加常驻面板数量、不拖垮拖拽帧率；
- 同样过五关，且写清楚 Figma 原生做不到 / 只能靠插件或外部工具的部分。

### 0.3 状态图例

| 标记 | 含义 |
| --- | --- |
| ✅ 已落地 | 有真实入口、结果、撤销、保存重开、EXE 截图 |
| ◐ 部分 | 主链路能跑，但缺关键子能力；不能对外说“这个模块做完了” |
| ○ 缺口 | 尚未实现，不能出现在界面里 |
| — | 明确不并入 Groma 主编辑器，另立产品或远期 |
| ? 待决 | 与现有红线/产品边界冲突，需要单独立项，不自动排期 |

### 0.4 当前判断（2026-11-23）

- **地基能撑住的**：场景树、命令层、撤销、原子保存、快照、序列化校验、5000 节点基准、选择/多选/成组/对齐、移动缩放吸附、手动参考线、A02 多页面全链路（拖排序 / 缩略图 / 跨页搜索 / 页级视口持久化）、A03 Section 基础链路（创建/命名/折叠/填充/Frame 入块/PNG 整块导出）、A05 快照浏览与回滚、A08 PNG/JPG/SVG 单画板/区块与本页批量导出、导出弹窗单焦点重排。
- **最缺的不是“效果数量”，是 Figma 的结构能力**：矢量、布尔、组件、变体、样式/变量、约束、Auto Layout、原型、Dev Mode。
- **最大风险**：在文件模型、样式体系、布局引擎没定型前先铺组件/原型面板，最后整套返工。
- **本轮结论**：先做文档结构，再做对象模型，再做样式/布局，最后才做组件/原型；UI 始终复用现有五区骨架，不另开常驻区域。

---

## 1 Figma Design 基线矩阵

### 1.1 文件、页面、结构

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| A01 | 工程/文件管理 | Recents、Drafts、Team projects、搜索、回收站 | ◐ 欢迎页有最近工程与新建；无搜索、草稿箱、回收站、重命名/复制工程 | 工程搜索、删除恢复、复制 | P2 |
| A02 | 多页面 | 单文件多 Page，新建/复制/重命名/拖排序/删除，切页独立画布 | ✅ 2026-11-23 全链路：页列表、新建/改名/复制/删除/切换/拖排序、页级撤销、保存重开；实时页面缩略图；左栏跨页图层搜索并跳页选中；当前页与各页视口按工程持久化，关掉重开恢复 | 页面模板/跨页组件不属于免费版核心，留后续 | **P0** |
| A03 | Sections | 画布区块包 Frame，可命名、折叠、背景、整体导出 | ◐ 2026-11-23 基础链路：`S` 工具 / 画布拖建、命名、图层树折叠、通用填充背景、Frame 可挂入区块、PNG 整体导出（含子 Frame）已真实窗口验收；无 Section 专属色板与自定义封面，嵌套 Section 只允许一层 | Section 专属视觉、更多嵌套规则 | P1 |
| A04 | Frame | 设备预设、自定义、无限嵌套、裁剪、圆角、滚动方向 | ◐ 设备预设/新建、移动缩放、裁剪；嵌套与滚动未验 | 嵌套 Frame、滚动设置 | P1 |
| A05 | 版本历史 | 自动/手动快照、命名、回滚、对比、分支合并 | ◐ 2026-11-23 已落地快照列表、页面预览、手动存版本、二次确认回滚、恢复前自动留底；2026-11-27 选中旧快照显示“相对当前：+N / -M / ~K”及变化图层名（本地文档 diff）；无命名版本、分支合并 | 命名版本、分支合并 | P1 |
| A06 | 保存/恢复 | 自动保存、崩溃恢复、保存失败可见 | ◐ 自动保存/三态已落地；崩溃恢复 UI 未完整验收 | 异常退出恢复入口 | P1 |
| A07 | 导入 | `.sketch`、SVG 粘贴、图片、文本 | ◐ 2026-11-24 已落地 SVG 文件导入（含内嵌图片）与 PNG/JPG/WebP 位图导入；位图写入工程 `assets`，场景只存引用，可作为图片节点选中/变换/替换/保存/重开/导出；2026-11-26 增加剪贴板图片粘贴（带文件启动工程后直接 `Ctrl+V`）；未做 `.sketch`、SVG/文本粘贴、拖放导入 | `.sketch`、SVG/文本粘贴、拖放 | P2 |
| A08 | 导出 | PNG/JPG/SVG/HTML/PDF、倍率、批量、Copy as CSS | ◐ 2026-11-27 四格式：PNG/JPG/SVG 原有能力保留；新增 HTML 可运行网页（文字可选、形状 CSS、路径内联 SVG、图片 data URL，无倍率），真实 EXE 导出 1200×760 / 3,376 B，Edge 与画板一致。范围仍支持当前选中图层 / 画板 / 区块 / 切片 / 本页全部，批量逐个写文件；JPG 强制白底，Section 仍按边界裁剪；导出弹窗单焦点，不挂外部应用；选中图层的 Copy as CSS 已在右栏图层检查器提供（`.样式卡-a` + 定位/圆角/渐变/描边/阴影/文本），未进导出弹窗；无 PDF、无 ZIP、无保存目录选择、无 JPG 质量滑杆 | PDF、ZIP、保存对话框、选区回传 | P1 |

### 1.2 画布与导航

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| B01 | 缩放/平移 | 2%–6400%、滚轮锚点、空格/中键、触控板 | ✅ 基础缩放平移、快捷键、适配 | 触控板手势验收 | P2 |
| B02 | 全部/选中适配 | `Shift+1` / `Shift+2`，180ms 缓出 | ✅ 2026-11-26 `Shift+1` 全部适配、`Shift+2` 选中适配；顶栏适配按钮有选中时按选区、无选中时按画板，均 180ms 缓出；真实 EXE 选中 320×200 卡片后 Shift+2 到 321%，卡片完整入画 | 触控板手势 | P2 |
| B03 | 标尺/参考线 | 开关、拖出、锁定、隐藏、删除 | ◐ 标尺、手动参考线、移动/删除/吸附已落地；锁定/隐藏/清空未做 | 参考线锁定与显示开关 | P1 |
| B04 | 像素/布局网格 | 像素网格、列/行/点阵布局网格 | ◐ 有点阵背景；像素网格开关、Frame 布局网格未做 | 布局网格 | P1 |
| B05 | 智能参考线 | 对齐线、间距数字胶囊、中心线 | ◐ 对齐吸附与手动参考线已落地；间距胶囊、绘制时吸附未做 | 间距数字胶囊 | P1 |
| B06 | 小地图 | 左下缩略全页、拖拽定位、`Shift+M` | ○ | 小地图 | P2 |
| B07 | 轮廓视图 | `Ctrl+Shift+\` 只看轮廓 | ○ | 轮廓渲染模式 | P2 |
| B08 | 大工程帧率 | 5000 节点 60fps 平移缩放 | ◐ mock 基准通过，真实帧时间未量 | 真实帧时间 + 选择层分离 | P0（地基） |

### 1.3 工具与对象

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| C01 | 选择/框选/多选/成组/对齐分布 | V、Shift 加减选、框选、Ctrl+G、6 向对齐、等距 | ✅ 已真实窗口验收 | 边缘穿透选择细节 | P2 |
| C02 | 基础形状 | Frame、矩形、直线、椭圆、多边形、星形、三角形、箭头、Slice | ● 2026-11-24 Frame/矩形/椭圆/文字 + 直线 + 箭头（线身 + 可填充三角头，SVG 同步导出）+ 多边形/星形（`path` 参数化，边数/角数 3–12、星形内径 10–90%）+ Slice（青色虚线标注、PNG/JPG/SVG 区域裁切）已落地；三角形可用多边形 3 边生成，无独立图标 | 形状参数化扩展 | P1 |
| C03 | 钢笔/矢量网络 | 角点/平滑点、拖手柄、增删锚点、分支路径 | ◐ 2026-11-25 钢笔一期+锚点编辑+多轮廓+共享顶点最小内核：`P` 钢笔工具、角点与对称手柄、首锚点闭合、双击/`Enter` 收尾、锚点叠层；拖锚点/手柄（`Alt` 单边）、线段插点、`Delete` 删点、整段拖动单步撤销；同一节点内 `Alt`+点空白追加多条轮廓，`Alt`+点锚点从同一坐标起分支；`PathAnchor.vertexId` 重复即共享顶点，拖动/删点/切角同步所有同 id 锚点，右栏显示“共享顶点 N 个”；右栏显示“当前轮廓 第 N / M 条”，`Ctrl/Cmd+Delete` 删除整条轮廓（只剩 1 条时拒绝）；闭合轮廓才填，开放轮廓只描边；双击切角点/平滑点；仍缺完整 Vector Network 图边/区域填充 | 完整 Vector Network、区域填充、图边遍历 | P1 |
| C04 | 布尔运算 | Union/Subtract/Intersect/Exclude、Flatten、Outline stroke | ● 2026-11-25 多对象四布尔 + Divide/Flatten/Outline：至少两个对象、同一父级、不得有子图层；支持矩形（圆角近似）、椭圆（48 点）、多边形/星形、闭合钢笔轮廓；贝塞尔固定 12 段 flatten；四布尔支持 3+ 对象，按父级 `children` 取 z-order（数组前为底层），差集为“底层减其余对象并集”；Divide 对 2–8 个对象枚举全部非空子集，逐块抠出互不重叠区域，复制最高层对象外观；Flatten 把所有闭合轮廓合成一个 `fillRule:nonzero` 的 `path`，复制底层外观；Outline 把每条实线描边按宽度转填色带（miter/bevel/round 近似），源描边清空；结果均单步撤销/重做，保存重开与 PNG/SVG 导出通过 | 更精确的 join/虚线转轮廓 | P1 |
| C05 | 蒙版 | 形状蒙版、图层裁剪、Alpha/亮度蒙版 | ◐ 2026-11-25 已落地几何形状蒙版，并补 Alpha/亮度蒙版：同容器单蒙版、裁切上方兄弟，画布/SVG/PNG/JPG/命中一致；右栏“轮廓 / Alpha / 亮度”切换，Canvas 离屏合成，SVG 输出 `mask-type`；蒙版组、图像蒙版、羽化/扩展未做 | 蒙版组、图像蒙版、羽化 | P1 |
| C06 | 图片 | 图片填充/资产、粘贴、裁剪焦点 | ◐ 2026-11-26 图片区域裁剪、粘贴图片与形状图片填充：PNG/JPG/WebP 导入、检查器替换图片、归一化 `imageCrop` 四角裁剪（框外压暗、拖动单步撤销、Esc/Enter、恢复/重置）；`Ctrl+V` 把剪贴板位图写入 `assets`，选中单一形状时直接填成图片；矩形/椭圆/钢笔路径支持 `imageFill`（铺满 cover / 适应 fit、焦点 X/Y、透明度），Canvas/SVG/PNG 一致；未做图片节点裁剪焦点、孤儿资产清理 | 图片节点裁剪焦点、孤儿清理 | P1 |
| C07 | 文本 | 富文本、字体、行高、字距、段落、列表、路径文字、链接 | ◐ 2026-11-26 基础文本、字号、字重、左/中/右对齐、行高、斜体、字距、段落间距、项目符号/数字列表已落地；字体族输入带常用字体 datalist，Canvas/SVG 同步列表前缀与段距；富文本片段样式、路径文字、链接、系统字体全量枚举未做 | 富文本、路径文字、链接 | P1 |
| C08 | Slice 切图 | 独立导出区域 | ● 2026-11-24 独立 `slice` 节点 + `K` 工具，画布青色虚线框与“切片 N”标签；导出按切片矩形裁切真实画面，PNG/JPG 位图、SVG 以切片尺寸建 `viewBox` + clipPath，切片自身不进导出；当前只支持单个矩形，不支持批量切片网格 | 切片嵌套与批量扩展 | P2 |

### 1.4 外观

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| D01 | 填充 | 多填充、纯色/渐变/图片/图案 | ✅ 2026-11-27 同节点最多 16 层填充：纯色/线性/径向、逐层透明度与显隐、上下移动；右栏“填充 · N 层”列表 + 选中层详细编辑；Canvas/SVG/PNG 按底层→顶层叠加，上层半透明可透出下层；图片填充存在时颜色层暂不参与绘制 | 图案填充、颜色层与图片层混排 | P1 |
| D02 | 描边 | 内/中/外、虚线、端点/拐角、可变宽度、转轮廓 | ◐ 描边数组、颜色/透明度/宽度、实线/虚线/点线/自定义 dash、端点 butt/round/square、转角 miter/round/bevel 已落地，Canvas/SVG 同步；Outline stroke 可转形状；未做内/中/外对齐、可变宽度 | 描边对齐、可变宽度 | P1 |
| D03 | 效果 | 投影/内阴影/图层模糊/背景模糊，多效果 | ◐ 2026-11-26 多投影 + 整层模糊已落地：每节点可叠多条效果，投影 X/Y/模糊/颜色/透明度，整层模糊半径；Canvas 离屏效果层按 alpha 投影，SVG 输出 `feDropShadow`/`feGaussianBlur` + `feMerge`；支持隐藏/移除、保存重开、PNG/SVG 导出；内阴影、背景模糊未做 | 内阴影、背景模糊 | P1 |
| D04 | 圆角 | 四角独立、缩放圆角 | ✅ 2026-11-27 四角独立圆角：`cornerRadii` 左上/右上/右下/左下，缺省回退统一圆角；右栏“四角独立/统一圆角”切换，Canvas 路径、PNG 导出、SVG rect/path 与工程保存重开一致；真实 EXE 截图 `shots/corners-final.png` | 缩放时保持视觉圆角（单角随 W/H 压缩） | P1 |
| D05 | 混合/透明度 | 全套 blend mode、整体透明度 | ◐ 仅透明度 | blend mode | P2 |
| D06 | 轮廓/扁平化 | Outline stroke、Flatten | ◐ 2026-11-25 随 C04.3 落地：Outline stroke 与 Flatten 已可从矢量菜单执行，支持单对象描边转形状；虚线/开放轮廓描边仍拒绝 | 更精确的 join、虚线转轮廓 | P1 |

### 1.5 布局

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E01 | Constraints | 左/右/居中/拉伸、上/下/居中/拉伸 | ✅ 2026-11-27 父 Frame/Section 缩放时按子层约束重排：右/下按父尺寸差平移、居中平移一半、左右/上下拉伸、按比例缩放；`patchNode` 尺寸变化自动应用，画布事务把子层纳入同一撤销；右栏水平/垂直双下拉，仅直接父级为 Frame 时显示 | 嵌套 Group 内子层递归、Auto Layout 衍生 | P1 |
| E02 | Auto Layout | 方向、padding、gap、主轴/交叉轴、Hug/Fill/Fixed、嵌套 | ◐ 2026-11-27 自动布局一期：Frame/Section/Group 支持横向/纵向、gap、四边 padding、交叉轴 start/center/end/stretch、主轴 start/center/end/space-between、Hug 主轴；子层按图层顺序、嵌套布局自内向外；画布拖子层被布局接管，改子层/容器尺寸立即重排；撤销同时恢复父容器与移动兄弟层。未做 Fill/Fixed 全组合、换行、布局网格、子层拖拽重排；新增子层后需点“重排” | Fill/Fixed 全组合、换行、布局网格、子层重排 | P1 |
| E03 | 响应式预览 | 宽度变化 + 约束 + Auto Layout 的组合验证 | ○ | 尺寸切换预览 | P2 |

### 1.6 组件、样式、变量

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| F01 | Component / Instance | 主组件、实例、Detach、Swap、Override | ○ | 组件节点 + 实例同步 | P1 |
| F02 | Variants | 属性组合、Boolean/Text/Numeric/Variant、嵌套 | ○ | 变体集与属性面板 | P1 |
| F03 | Libraries / Assets | 团队库、个人库、发布/更新、资产搜索 | ○ | 本地库 + Assets 面板 | P2 |
| F04 | Styles | Paint/Text/Effect/Grid 四类样式、命名空间 | ◐ 2026-11-27 文档级命名样式：填充/描边/效果/文本四类，节点 `styleRefs` 绑定；右栏“存为样式 / 绑定 / 同步到样式 / 解除 / 删除”，样式值偏离时提示“已偏离”；更新样式会同步所有同类绑定图层，删除样式清引用；右栏“复制变量”输出 `:root { --groma-... }`，“导出令牌”写 CSS + JSON 两个文件到工程 `exports`（真实 EXE：CSS 272 B / JSON 375 B），多填充按顶层到底层、纯色转合法渐变；暂用“保留绑定 + 手动同步”，未做 Figma 式编辑即解绑、Grid 样式、样式重命名 UI | 编辑即解绑、Grid、重命名 UI | P1 |
| F05 | Variables | Color/Number/String/Boolean、集合、Modes、绑定、引用 | ○ | 变量表 + Mode 切换 | P1 |
| F06 | Design Tokens | 变量导出到代码 token | ○ 只有 scene JSON | token JSON 导出/导入 | P2 |

### 1.7 原型

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| G01 | 交互连接 | Trigger + Action + Destination；点击/拖拽/悬停/按键/定时/页面加载 | ○ | 原型边模型 + 连线 UI | P2 |
| G02 | Overlay / Swap / Scroll | 浮层、替换、滚动到、返回 | ○ | 动作类型逐个落地 | P2 |
| G03 | 变量/条件/表达式 | Set variable、if/else、loop | ○ 依赖变量系统 | 变量驱动原型 | P2 |
| G04 | 转场 | Instant/Dissolve/Move/Slide/Push/Smart Animate、时长/缓动 | ○ | 转场模型 + 播放器 | P2 |
| G05 | 演示 | Present、设备框、多起点、录屏、分享 | ○ 本地版 | 本地 HTML/EXE 预览 | P3 |

### 1.8 Dev Mode 与交付

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| H01 | Inspect | 尺寸/颜色/字体/间距/圆角/阴影属性 | ○ 右侧检查器只有基础几何/填充 | 完整属性读值 + 复制 | P2 |
| H02 | 代码生成 | CSS / SwiftUI / Compose | ○ | CSS 先行 | P2 |
| H03 | Assets / 标注 / 状态 | 资源下载、Frame 状态、Annotations、Issue 链接 | ○ | 本地标注 + 状态 | P2 |
| H04 | Code Connect | 组件映射真实代码组件 | ○ | 本地组件映射 | P2 |
| H05 | VS Code / 外部集成 | 设计查看、代码片段 | ○ 只有 MCP | 本地 MCP/CLI 扩展 | P3 |

### 1.9 协作与生态

| ID | 能力 | Figma 基线 | Groma 现状 | 下一缺口 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| I01 | 评论 | 对象评论、@提及、线程、Resolve、原型内评论 | ○ | 本地评论文件 + 侧栏 | P3 |
| I02 | 实时多人 | 多人光标、Presence、Follow、权限 | — 现有单机红线；局域网无账号协作远期 | 另立项，不塞主壳 | 远期 |
| I03 | 插件 | JS/TS 插件读写节点、UI、社区市场 | ◐ 有 MCP stdio，不是应用内插件 | 本地插件沙箱，无市场 | P2 |
| I04 | REST / Webhooks | 文件/评论/版本/导出 API | — 本地版不做云端 API；文件 JSON + MCP 替代 | 不排期 | — |
| I05 | 多平台 | Web/macOS/Windows/iPad/移动查看 | ◐ Windows 桌面已跑；macOS/Linux/iPad 未打包 | 先 Windows 稳定，再跨平台 | P3 |

### 1.10 Figma 衍生品（保留归宿，不塞主壳）

| ID | 能力 | 去向 | 状态 |
| --- | --- | --- | --- |
| J01 | FigJam 白板 | 独立白板产品/不并入 Groma | — |
| J02 | Figma Slides | Lanterna 承接 | — |
| J03 | Figma Sites | 独立发布产品，不并入主编辑器 | — |
| J04 | Figma Buzz | 独立品牌资产产品 | — |
| J05 | Figma Draw / 插画 | Vecora 承接；仅“文字沿路径/可变宽度描边”可择机进 Groma | — / 待择机 |

---

## 2 融合矩阵（Figma 原生弱项或需外部工具）

| ID | 融合能力 | 参考来源 | 为什么值得 | Groma 现状 | UI 归宿（不许新增常驻面板） | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| K01 | 本地优先、离线工程 | Chapter / 本地工具 | Figma 强云依赖；本地文件更可控 | ✅ `.groma` + 快照 | 文件系统，不进面板 | 已落地 |
| K02 | MCP / 外部自动化 | 小方工作室全线要求 | 外部客户端不开界面读写工程 | ◐ 0.3.1 / 19 个 stdio 工具；新增 `groma_capabilities`、单节点精确读、2×3/百块画板网格、最多 200 节点批量改、页面改名/背景、`cornerRadii` 四角补丁；布尔与分组写入仍未注册 | 独立服务，不进主界面 | P1 |
| K03 | 可读 JSON / Git 友好 | Penpot / 开源工具 | diff、回滚、脚本、CI | ◐ scene.json 可读；无 diff/合并 | 文件格式，不加 UI | P2 |
| K04 | 本地插件沙箱 | Figma Plugin API | 扩展能力但不依赖社区市场 | ○ | 命令面板 + 独立插件窗口 | P2 |
| K05 | 代码组件映射 | Figma Code Connect / Storybook | 设计组件直接对应真实代码 | ○ | 右栏 Code 分组，仅选中组件时出现 | P2 |
| K06 | 局域网无账号协作 | tldraw / Penpot 自托管 | 小团队不想上云 | ○ | 顶栏在线状态；不新增协作面板 | 远期 |
| K07 | 高级原型逻辑 | ProtoPie / Framer | 条件、变量、真实数据 | ○ | Prototype 页签内渐进披露 | P3 |
| K08 | 矢量动效时间线 | Rive / AE | 图标、加载、交互动效 | ○ | 独立 Motion 模式，不塞 Design 右栏 | P3 |
| K09 | 3D / 视频 | Spline / AE | 视觉表现强，但不是 UI 主链路 | — 现有产品红线 | 独立产品，不进 Groma | 不排期 |
| K10 | AI 辅助 | Figma AI / Galileo 等 | 生成/整理/检查 | ? 与工作室红线冲突 | 即使做也只进命令面板侧车 | 待决 |

### 2.1 融合排序原则

1. **先做“工程能力”而不是“炫技能力”**：K01–K05 先于 K07–K10。
2. **任何融合能力都不能改主壳布局**；必须能找到已有归宿，否则不开工。
3. **3D/视频/AI 不自动立项**。它们与现有红线或产品边界冲突，必须单独决策，不能借“融合”名义混进主编辑器。

---

## 3 刀序（避免架构返工）

| 刀 | 目标 | 为什么这个顺序 | 出口 |
| --- | --- | --- | --- |
| 1 | **A02 多页面与页面管理**（含拖排序、缩略图、跨页搜索、页级视口持久化） | 文件模型必须先定；否则组件库、版本历史、导出都要返工 | 建/切/改名/复制/删除/拖排序，切页恢复各自视口，缩略图与跨页搜索，撤销与保存重开；窗口截图 |
| 2 | **A03 Sections + A05 版本历史浏览与回滚** | 页面之下需要区块；版本回滚要能看到真实快照 | A05 已落地快照列表/预览/手动存版本/回滚；A03 基础链路（创建/命名/折叠/填充/Frame 入块/PNG 整块导出）已落地，专属视觉与嵌套规则仍待补 |
| 3 | **C03 矢量 + C04 布尔 + C05 蒙版** | 组件、图标、布尔都依赖矢量节点；这是对象模型地基 | C03 已落地钢笔、锚点/手柄、闭合/开放、锚点拖拽/插点/删点、同节点可编辑多轮廓、共享顶点（`vertexId`）、当前轮廓序号与整条轮廓删除、角点/平滑点切换、开放轮廓只描边、持久化与单图层导出；C04 已落地多对象（2+）Union/Subtract/Intersect/Exclude、同父级校验、按 z-order 的差集方向，并补齐 Divide / Flatten / Outline stroke、单步撤销/重做与保存重开导出；C05 已落地几何形状蒙版与 Alpha/亮度蒙版，画布/SVG/PNG/JPG 一致；下一刀补蒙版组、图像蒙版、羽化与完整 Vector Network |
| 4 | **D01–D06 外观 + F04 样式 + F05 变量** | 先有统一 paint/style/token，再做组件库，避免每个组件各写一套颜色 | 多填充/描边/效果/四角；样式与变量能绑定、能切 Mode |
| 5 | **E01 约束 + E02 Auto Layout** | 布局引擎要先于组件变体，否则组件尺寸规则无法闭合 | Frame 改尺寸子节点按约束响应；Auto Layout Hug/Fill/Fixed |
| 6 | **F01–F03 组件/变体/库** | 依赖矢量、样式、变量、布局四层 | 主组件/实例/变体/覆盖/本地库 |
| 7 | **G01–G05 原型** | 依赖组件、变量、转场；太早做会变成假连线 | 点击/悬停/定时 + 跳转/浮层 + Smart Animate + 本地播放 |
| 8 | **H01–H04 Dev Mode** | 依赖完整属性与组件映射 | Inspect/CSS/资源/本地 Code Connect |
| 9 | **A07 导入、PDF / 保存对话框 + K02–K05 融合** | 对象模型稳定后再扩格式，避免反复改序列化 | SVG/图片导入、PDF、保存目录、MCP 补全、本地插件 |
| 10 | **I01 评论 / K06 局域网 / K07–K10** | 最后做协作与高风险管理项 | 单独立项，不阻塞主线 |

### 3.1 第一刀：A02 多页面核心（2026-11-22 已落地）

**A02 多页面与页面管理**，只做这一条链路：

- 左栏 Pages 区：当前页高亮；新建、改名、复制、删除、切换。
- 每页独立根节点、背景、参考线；切页清空选区，画布显示对应页。
- 页操作进入撤销历史；删除最后一页禁用并说明原因。
- 保存 → 关窗 → 重开，页顺序/名称/内容/参考线一致。
- 不做页面模板、跨页组件、页面缩略图；这些等后续刀。
- UI 不新增第六个区域；只在现有左栏 Pages 区内做列表与一个“+”入口。

**验收记录（2026-11-22）**

- 数据：`Page{id,name,rootId,background,guides?}` 已有；新建页生成独立 `type='page'` 根节点，页名与根节点名同步；复制页深克隆整棵子树并重映射 id。
- 逻辑：页面增删改复制与切页进入 `pages` 历史条目；撤销/重做恢复页结构与选区，切页清空选区；只剩一页时删除被禁用并显示“至少保留一个页面”。
- 测试：`src/core/pages.test.ts` 5 条 + `src/state/editor.test.ts` 4 条页面链路，完整 14 个测试文件、72 条测试通过。
- 真实窗口：`shots/pages-first.png` 初始页列表；`pages-add.png` 新建“页面 2”空态；`pages-switch.png` 切回页面 1 后画布/图层恢复；`pages-rename-commit.png` 行内改名 `Home`；`pages-duplicate.png` 复制为“页面 1 副本”；`pages-delete.png` 删除副本并切回页面 1；`pages-last-menu-final.png` 最后一页删除禁用并显示“至少保留一个页面”；`pages-undo.png` / `pages-redo.png` 新建页撤销重做；`pages-save-add.png` / `pages-save-reopen.png` 保存重开仍是两页；`pages-compact.png` / `pages-wide.png` 最小与宽屏无溢出；`pages-final.png` 最终 EXE 三页状态。
- 交付指纹：`npm run gate` PASS（14 个测试文件、72 条测试；MCP selftest 通过）；EXE 3,215 KB，2026-11-22 19:58:34。
- 边界：拖排序、页面缩略图、跨页搜索、页级缩放/滚动记忆未做；不把 A02 写成“Figma 全量已完成”。（拖排序与页级视口记忆已在 3.2 补齐）

### 3.2 A02 第二批：拖排序与页级视口记忆（2026-11-22 已落地）

**这一批只补 A02 内的两条缺口，不另开面板：**

- 页面拖排序：在现有页行上 pointer 拖动，5px 阈值后才进入拖动态；按其余页行的中点计算目标索引，固定定位的 2px 主黄插入线标出落点；拖动页行淡到 45%，列表内滚动到上下边缘时自动滚；松手只调用一次 `editor.movePage()`，并抑制拖动后误触的一次点击。
- 键盘等价入口：页行聚焦后 `Alt+↑/↓` 上移/下移一页（越界不动）。
- 每页视口记忆：`EditorState.viewports` 按页 id 保存 `{x,y,scale}`；切页、撤销/重做跨页、删除页后切相邻页均优先恢复该页记录，没有记录才重新适配；平移、滚轮缩放、顶栏缩放、Shift+1 都会写回当前页。
- 撤销：页面排序作为 `kind:'pages'` 历史条目，记录排序前后文档、当前页与选区；排序不改变当前页。

**验收记录**

- 纯函数：`pages.test.ts` 新增“移动页面只改 pages 顺序，越界和原位返回 null”；`editor.test.ts` 新增拖排序撤销/重做、当前页不变、页级视口切换恢复、删除页后相邻页与撤销恢复被删页视口。
- 真实窗口：`shots/pages-drag-hold.png` 按住拖动显示插入线与源页行淡出；`pages-drag-top.png` 页面 3 拖到顶部；`pages-drag-bottom.png` 从非当前页把页面 1 拖到底部，松手后当前页仍是页面 3（验证点击抑制）；`pages-viewport-page1.png` 页面 1 空格拖平移；`pages-viewport-page2.png` 切到页面 2 后回到默认视口；`pages-viewport-back.png` 切回页面 1 恢复平移；`pages-final-drag.png` 最终 EXE 三页拖排序结果。
- 交付指纹：`npm run gate` PASS（14 个测试文件、76 条测试；MCP selftest 通过）；EXE 3,216 KB，2026-11-22 21:10:07。
- 边界（历史，已补）：11-22 时视口记忆只在本次会话内存中；11-23 已改为按工程写 `localStorage`，重开恢复，见 3.3。页面缩略图、跨页搜索亦已在 3.3 补齐。`Alt+↑/↓` 已接入，但虚拟桌面的 `PostMessage` 不能可靠合成 Alt 按下状态，未单独实拍；鼠标拖拽的顶部/底部落点已实拍。

### 3.3 A02 第三批：缩略图、跨页搜索、页级视口持久化（2026-11-23 已落地）

- 页缩略图：`drawPageThumbnail` 复用 `drawNode`，内容包围盒等比适配，34×22 CSS px @ DPR 2；当前页随 doc 重画，非当前页缓存；空页画淡“空”字。没有新面板。
- 跨页搜索：页头搜索按钮 → 左栏瞬态浮层；按页深度优先搜图层名，显示图层名/父级路径/页名；点击结果切页 + 选中 + 页行焦点；`Esc` 与外部点击关闭，`Esc` 恢复搜索按钮焦点。
- 页级视口持久化：`project-ui.ts` 以 `groma:project-ui:v1:<projectId>` 存 `{pageId,viewports}`；打开工程/`--open` 读取，`EditorShell` 120ms 防抖 + `beforeunload` 写回；坏 JSON/坏视口值忽略。
- 自动保存守卫：`savedDocRef/savedProjectRef` 跳过“首次挂载只打开就保存”，修复无端多版本。

**验收**：搜索 4 条、界面记忆 2 条、`loadDoc` 恢复 1 条；16 文件 / 84 测试全绿。`thumb-base.png`、`thumb-live-rect.png`、`thumb-active-check.png` 证明缩略图实时；`search-open/query/select/crosspage/two-pages/click-first/esc.png` 覆盖搜索与焦点；`persist-page-before/reopen.png` 证明关窗重开回页面 3 且标尺位移保持。

**边界**：搜索无上下键选择；`Ctrl+F` 代码有入口，但合成 `Ctrl` 不可靠，未实拍通过。非当前页缩略图不后台实时刷新。视口记忆在 WebView `localStorage`，换机器/清数据会丢视图，不影响工程内容。不做页面模板/自定义封面。

### 3.4 A05 版本历史浏览与回滚（2026-11-23 已落地，未全量）

- 后端四个命令：list/create/load/restore；快照 `<工程>/snapshots/<ms>.json`，最多 20 份，恢复前先把当前 scene 快照，回滚可再回滚。恢复前前端先 `saveProject(...,false)` 把内存最新改动落盘，避免刚改完就恢复时丢未保存编辑。
- 手动存版本：`saveProject(..., false)` 只落 scene，不额外留快照，再 `createSnapshot` 一条；普通保存/自动保存仍默认 `snapshot_before=true`。
- 同内容去重：`groma_save_project` 读当前 `scene.json` 与待写文本，完全一致则跳过快照；恢复后自动保存、重复保存不会多版本。
- UI：820×620 上限响应式弹窗，左列表/右预览、多页切页、保存版本、二次确认恢复、`Esc`/背景关闭；1040×680 复验后预览标题/元信息不被画布覆盖。

**验收**：`version-topbar/open/confirm/restored.png` 覆盖入口、列表、预览、确认与 3 页→1 页回滚；`version-noop-open.png` 5→5；`version-manual-one.png` 手动存版本文件 9→10；`version-restore-no-dup.png` 恢复最新版 12→13；`version-restore-3pages-final.png` 恢复 3 页快照，页面 2/3 出现，13→14；`version-compact.png` 1040×680；`version-open-final.png` 打开工程 13→13；`version-final-restore.png` 在复制工程上完成最终 EXE 恢复，画布显示 6 图层设计；`version-final-modal.png` 打满 20 份快照的自检工程打开后仍 20→20。EXE 3,232 KB，2026-11-23 13:58:48。

**边界**：无命名版本/diff/分支合并；无自定义上下键与焦点陷阱；恢复不能 `Ctrl+Z`，只能再恢复留底；快照是整份 JSON，无压缩/增量；关闭窗口前 600ms 改动仍可能丢，崩溃恢复未做；列表显示到秒，同秒多版本文案相同。

### 3.5 C02 形状与切片工具：直线 / 箭头 / 多边形 / 星形 / Slice（2026-11-24 已落地）

- 入口：顶栏在椭圆后依次新增斜线、箭头、多边形、星形、钢笔、切片图标；快捷键 `L` / `A` / `G` / `Y` / `P` / `K`。工具激活后画布显示行内预览，松手回到选择工具；1040 紧凑窗口隐藏工具分组竖线，保证 13 个入口完整且文件名不被挤没。
- 直线：`Tool` 增加 `line`；`addNode` 支持 `path`，写入 `pathData / pathW / pathH / strokes`；path 默认 `fills: []`，默认 `#221C00`、2px 尖角描边。
- 箭头：`src/core/arrow.ts` 生成线身 `pathData` 与填充三角头 `arrowHeadData`；头长随线长夹在 8–24，两翼计入包围盒；`SceneNode` 增加 `arrowHeadData`，`shapeKind:'arrow'`。画布用描边色填充三角头，SVG 同时输出线身 `<path>` 和三角头 `<path>`，改描边颜色/宽度同步生效。
- 多边形/星形：`src/core/shapes.ts` 生成闭合 `polygonPath(w,h,sides)` / `starPath(w,h,points,innerRatio)`；边数/角数夹在 3–12，星形内径 0.1–0.9、默认 0.38，第一个顶点固定在正上方。
- 数据：`SceneNode` 增加 `shapeKind / shapeSides / shapeInnerRatio`；`schema.ts` 校验范围与 `arrowHeadData` 非空；`pathData` 仍是最终渲染线身路径，参数化字段只用于改边数时重算。
- 创建：画布拖出包围盒后生成 5 边多边形 / 5 角星形，默认 `#D9D9D9` 填充、无描边、名称“多边形 N / 星形 N”；拖动宽或高 <3px 时兜底 120×120。箭头起止点 <3px 时兜底 120×60，名称“箭头 N”。
- Slice：`NodeType / Tool` 增加 `slice`；拖出的切片挂在最深画板，名称“切片 N”，`fills:[]`、`children:[]`、不裁剪，宽或高不足时兜底 160×120。画布仅显示青色虚线框、极淡青底与左上角“切片 N”标签，常态可见，导出时强制隐藏；不进入画板计数。
- 切片导出：`renderSliceRaster / Png / Jpg` 从页面根重绘并平移到切片零点后裁切，透明 PNG 保留透明、不透明与 JPG 先铺白底；`renderSliceSvg` 以切片尺寸为 `width/height` 与 `viewBox`，用独立 clipPath 裁切，切片节点自身不输出。普通画板/区块导出和缩略图也打 `exporting` 标记，避免虚线混入。
- 检查器：多边形/星形显示“形状”段（边数 / 角数 + 内径%），改值调用 `setShapeParams` 并按当前 W/H 重算，只进一条撤销；箭头的 `setShapeParams` 直接拒绝，避免把三角头改坏。
- 渲染：复用现有 path 渲染、命中、缩放与 SVG 导出，不新增第二套形状图元；箭头三角头跟随描边透明度与颜色。
- 测试：`line.test.ts` 4 条、`arrow.test.ts` 4 条、`shapes.test.ts` 4 条；`schema.test.ts` 14 条（含切片类型与非法几何）；`svg.test.ts` 8 条（两形状闭合路径、箭头双 path、切片裁切与居中文本锚点）；`editor.test.ts` 29 条（含切片落盘/无填充/撤销）；`doc.test.ts` 5 条（画板计数忽略根级切片）。
- C02 收口时 `npm run gate` PASS（23 个测试文件 / 135 条测试，MCP selftest 通过）；当时 EXE 3,281 KB，2026-11-24 20:57:07；前端 `index-CPsLA2Dx.css` 58.03 kB、`index-BTAErJ2y.js` 422.13 kB。当前全量见 3.13：25 文件 / 166 条。
- 真实 EXE：`shape-final.groma` 拖出五边形/五角星，改八边形/内径 55%，保存重开仍在；`arrow-final.groma` 拖出斜向与近水平两支箭头，`scene.json` 两支都挂 `frame-1`，各有 `arrowHeadData`、`fills:[]`、2px `#221C00` 描边，保存重开三角头与方向不变；`slice-final.groma` 中切片 `slice-mwuomxf8-1` 为 X443/Y182/527×497，保存重开恢复且画板计数仍为 1。
- UI：`shots/arrow-final-1440.png`（两支箭头与箭头检查器）、`arrow-reopen-1440.png`（重开）、`arrow-final-1280.png` / `arrow-1040.png`（紧凑窗口）；`shots/slice-reopen-1440.png`（展开图层、选中切片、青色虚线框、检查器）、`slice-export-dialog-1440.png`（切片 SVG 527×497）、`slice-compact-1040.png`（12 入口不重叠、文件名完整）、`slice-final-export-1440.png`（SVG 导出 Toast）。`shots/shapes-final-1440.png` / `shapes-final-1280.png` / `shapes-1040-inspector.png` 为多边形/星形三档。左栏 footer 实底、左右面板 `overflow:hidden`、页行与底栏“画板”只统计 Frame。
- 切片导出实测：PNG `切片 1@1x.png` 527×497 / 14,235 B；SVG `切片 1.svg` 1,278 B，`viewBox="0 0 527 497"`，Edge 渲染与 PNG 的卡片右缘、墨色圆、标题尾“oma”、副标题残段与横条一致；导出文件不含青色虚线或“切片 1”标签。
- 边界：直线/箭头都没有锚点编辑；箭头只做直线段 + 单色三角头，没有曲线箭头、端点样式、虚线端帽专属控件；多边形/星形无旋转角、圆角专属控件；三角形只能用多边形 3 边生成，没有独立工具；Slice 只支持单个矩形区域，尚未做批量切片网格、嵌套切片全部参与本页批量导出，1040×680 三栏下画布仍偏窄。

### 3.6 C03 钢笔/矢量路径一期（2026-11-24 已落地）

- 入口：顶栏在星形和切片之间加钢笔图标，`P` 快捷键；左栏图层图标与右栏类型 chip 统一为“钢笔”。画布底部提示：“单击放锚点 · 拖动出手柄 · `Enter` / 双击收尾 · 点首点闭合”。
- 几何：新增 `src/core/pen.ts`。`PenAnchor` 存世界坐标，`PathAnchor` 存节点局部坐标；相邻锚点任一有手柄时输出三次贝塞尔 `C`，否则 `L`；闭合路径补最后一段并加 `Z`。`penGeometry` 把锚点与 in/out 手柄一起计入包围盒，同时输出节点 `x/y/w/h`、`pathW/H`、局部锚点与 `closed`；少于 2 个锚点无效，闭合少于 3 个锚点时降级为开放路径。
- 数据：`SceneNode` 增加 `pathAnchors?: PathAnchor[]` 与 `pathClosed?: boolean`；`PathAnchor` 为 `{x,y,inX,inY,outX,outY}`，schema 校验至少 2 个锚点、六个字段均为有限数字、`pathClosed` 必须布尔。钢笔节点仍是 `type:'path'`，靠 `pathAnchors` 判定，旧路径节点不受影响。
- 创建：第一次点击确定父画板并开会话；之后每次点击加锚点，拖动生成对称手柄（out=指针点，in=锚点镜像）；点首锚点（≥3 个且屏幕距离 ≤8px）闭合。靠近最后锚点 420ms 内再次按下视为双击收尾；`Enter/Escape` 在捕获阶段收尾；切换工具自动收尾。收尾后新增节点、选中并切回移动工具。闭合路径默认 `#D9D9D9` 填充、无描边；开放路径不传填充，沿用 `#221C00` 2px 描边。
- 叠层：新增 `pen-overlay` SVG，品牌黄虚线预览、白底锚点方块、首锚点实心黄、灰手柄线与圆点；选中钢笔节点且当前工具为钢笔时也显示锚点。节点被缩放时按 `w/pathW`、`h/pathH` 映射锚点，避免缩放手柄后错位。
- 单图层导出：新增 `renderNodePng / renderNodeSvg`，选中任意非页面图层时以自身包围盒为零点导出；`ExportDialog` 不再把选中的钢笔/形状强制上溯到父画板。PNG 支持 1×/2×、透明背景，SVG 输出该图层自身 `viewBox`。画板/区块/切片继续走原专用导出。
- 顶栏回归：第 13 个工具入口曾把 1440 物理窗口（CSS viewport 946、DPR 1.5）的工程名压到工具条下。把紧凑规则从 `max-width:900px` 上移到 `max-width:1180px`，工具按钮 28→23、隐藏 `.tool-sep`、隐藏导入/版本文字、工程名 `min-width:0`；复测 `.topbar-left` 右界 294 = `.topbar-tools` 左界 294，工程名 x101–221 完整。
- 测试：新增 `pen.test.ts` 4 条（路径命令、包围盒含手柄、闭合降级、锚点映射）；`schema.test.ts` +1（接受钢笔锚点、拒绝非法手柄/残缺锚点，共 15）；`editor.test.ts` +1（闭合钢笔落盘/填充/描边/撤销，共 30）；`svg.test.ts` +1（单图层钢笔 SVG 零点与路径，共 9）。
- 完整 `npm run gate` PASS：24 个测试文件 / 142 条测试，MCP selftest 通过；EXE 3,283 KB，2026-11-24 21:42:32；前端 `index-CH1qqibQ.css` 58.40 kB、`index-DLuSIfC-.js` 430.08 kB。
- 真实 EXE：`pen-final.groma` 在 `桌面 1440` 内画一条 5 锚点闭合曲线和一条 4 锚点开放曲线，保存后 `scene.json` 为 `钢笔 1`（`pathClosed:true`、5 锚点、`#D9D9D9` 填充、无描边、377.33×427.38）与 `钢笔 2`（`pathClosed:false`、4 锚点、无填充、1 条 2px 墨色描边、296.47×369.63）；重开图层、锚点叠层与检查器全部恢复。
- 导出实测：选中 `钢笔 1` 后弹窗标题“图层 · 钢笔 1”、PNG 1× 377×427；`钢笔 1@1x.png` 白底位图、`钢笔 1.svg` 471 B、`viewBox="0 0 377.33 427.38"`，Edge headless 渲染与 PNG 轮廓一致；开放路径 `钢笔 2@1x.png` 为 296×370，线身只在开放段，无闭合填充。
- UI：`shots/pen-create-1440.png`（闭合+开放两条路径、选中钢笔、锚点/手柄叠层、检查器 5 锚点/闭合）、`pen-reopen-1440.png`（保存重开恢复）、`pen-reopen-1280.png` / `pen-reopen-1040.png`（紧凑窗口）、`pen-export-dialog-1440.png`（图层目标与 377×427）、`pen-export-png-1440.png`（PNG Toast）、`pen-export-open-1440.png`（开放路径导出）、`topbar-pen-probe2.png`（13 入口不与工程名重叠）。
- 一期当时边界：锚点只读展示，不能拖动改手柄、增删锚点或把路径拆成子路径；只做单条连续路径，分支/多路径矢量网络未做；钢笔默认填充/描边是固定值，未做成可记忆的工具样式；1040×680 下工程名会省略为“钢…”，三栏画布仍偏窄。锚点编辑已在 3.7 补齐。

### 3.7 C03 钢笔锚点编辑（2026-11-24 已落地）

- 几何命中：`nearestOnPenPath` 对直线段直接投影，对贝塞尔段按 32 段采样，返回最近段序号、参数 `t`、落点与屏幕距离；`pathAnchorsToWorld` 按节点 `w/pathW`、`h/pathH` 把局部锚点/手柄还原到世界坐标，缩放过的小路径也能正确命中。
- 在线段插点：`insertPenAnchor` 对贝塞尔段用 De Casteljau 在 `t` 处切分并同时改写相邻两端手柄，插点不改变原曲线形状；对直线段插入无手柄角点。少于 2 个锚点时 `removePenAnchor` 拒绝删除。
- 编辑器写入口：新增 `setPathAnchors(id, anchors, closed, silent)`。重算 `penGeometry`、节点包围盒和 `pathData`；`silent=true` 供拖动中连续更新，配合 `beginTransaction/endTransaction` 把一次拖拽合成一条撤销；插点/删点不静默，直接写一条历史。
- 画布交互：钢笔工具下选中单条钢笔时，指针距锚点 ≤7px 或手柄 ≤6px 即进入编辑；拖锚点会连同 in/out 手柄整体平移，拖 out/in 手柄默认保持对称，按住 `Alt` 只改单边；点击路径段 ≤6px 处插点并选中新锚点；`Delete/Backspace` 删除选中锚点，最少保留 2 个；`Escape` 只清锚点选择，不退出钢笔工具。
- 反馈：选中锚点加 `.pen-anchor.is-selected` 深色描边；画布底部提示改为“拖动锚点/手柄改形 · 点线段加点 · Delete 删锚点”；右栏说明同步。检查器锚点数与开放/闭合随编辑即时刷新。
- 测试：`pen.test.ts` 从 4 增至 7 条（线段命中/插点、贝塞尔切分/删点下限、缩放还原）；`editor.test.ts` 31 条（锚点编辑重算包围盒、单步撤销、静默拖拽事务合并）。
- 完整 `npm run gate` PASS：24 个测试文件 / 146 条测试，MCP selftest 通过；EXE 3,284 KB，2026-11-24 22:28:12；前端 `index-D--MXBsj.css` 58.48 kB、`index-C_v_y0DE.js` 436.22 kB。
- 真实 EXE：复制 `pen-final.groma` 为 `pen-edit.groma`，最大化到 1707×1019 工作区、缩放到 100%，选中 `钢笔 1` 后拖动第 3 个锚点，包围盒由 377.33×427.38 变为 473.33×438.75；拖手柄改形后点线段插点，锚点 5→6，按 `Delete` 回到 5；保存后 `scene.json` 仍为闭合 5 锚点，重开锚点叠层、检查器和改写后的 `pathData` 全部恢复。
- `Alt` 单边手柄实测：另复制 `pen-alt.groma`，按住 `Alt` 向右上拖第 3 锚点的 out 手柄，`out` 从 377.33,296.47 变为 431.33,264.47，`in` 保持 377.33,219.47 不动；`W` 由 377.33 变 431.33，保存重开保持。驱动脚本 `tools/cdp-pen-edit.mjs` / `cdp-pen-alt.mjs` 可复跑。
- UI：`shots/pen-edit-max.png`（最大化窗口下 5 锚点、选中锚点深色描边、检查器 473.33×438.75）、`shots/pen-edit-reopen-max.png`（保存重开）、`shots/pen-alt-max.png`（`Alt` 单边手柄后 W 431.33）。`tools/shot.ps1` 新增 `-Maximized`，用 `ShowWindow(hwnd, 3)` 铺满工作区后再截图，不再用 1440×900 小窗口验收。
- 边界：仍是单条连续路径，分支/多路径 Vector Network 未做；锚点最少 2 个，删到 2 后拒绝继续删除；手柄默认对称、`Alt` 单边是当前手感，尚未加“断开手柄”独立状态；插点按 32 段采样，极限放大时落点精度仍可能差一个采样步长；缩放后编辑把 `w/pathW` 重置为 1 的视觉跳动尚未专项压测。（多轮廓与角点/平滑切换已在 3.8 补齐）

### 3.8 C03 多轮廓复合路径 + 角点/平滑点（2026-11-24 已落地）

- 数据：`PathContour { anchors: PathAnchor[]; closed: boolean }`；`SceneNode.pathContours?: PathContour[]`。单轮廓仍只写旧 `pathAnchors/pathClosed`，多轮廓才写 `pathContours` 并把第一条镜像回旧字段；schema 校验 `pathContours` 非空、每条至少 2 个合法锚点、`closed` 为布尔，旧工程无字段照常加载。
- 几何：`penContoursGeometry` 让多条轮廓共享同一个包围盒原点，`pathData` 按每条轮廓拼一个 `M` 子路径，闭合轮廓带 `Z`；`nodePathContours` 优先读 `pathContours`，否则把旧 `pathAnchors` 包成单轮廓；`pathContoursToWorld` 逐条还原世界坐标。
- 写入口：统一为 `commitPathContours` / `setPathContours`；`setPathAnchors` 改为只替换第一条轮廓并保留其他轮廓，避免旧调用把分支吃掉。节点 `w/h`、`pathW/pathH`、`pathData` 每次重算，拖拽仍按一次事务合并撤销。
- 画布：锚点引用从单个索引升级为 `{ contour, index }`；命中、拖锚点/手柄、线段插点、`Delete` 删点、选中态都按具体轮廓工作；删到不足 2 个锚点时，若还有别的轮廓就整条移除并选中相邻轮廓。钢笔工具下选中一条钢笔后，`Alt`+点击空白向当前节点追加新轮廓；`Alt`+点已有锚点则以相同世界坐标起一条新分支轮廓，收尾后保持钢笔工具与节点选中。
- 填充与描边：Canvas 与 SVG 都按轮廓拆绘制，只有闭合轮廓参与填充，开放轮廓固定 `fill="none"`、只吃节点描边；追加开放分支时若节点原本没有描边，自动补 2px `#221C00` 实线，避免开放线不可见。
- 角点/平滑点：`togglePenAnchorType` 根据前后锚点连线生成共线等长手柄，开放端点只看唯一邻居，闭合轮廓首尾环绕；双击锚点即可切换，再双击还原角点。手柄长度取相邻距离较小值的 33%，只改局部锚点，不移动锚点本身。
- 反馈：右栏“钢笔路径”新增“轮廓 N 条”，锚点显示总数，路径状态可显示“1 闭合 / 1 开放”；说明补“双击锚点切角/平滑；Alt + 点锚点起分支，Alt + 点空白追加轮廓”。画布底部提示同步。
- 测试：`pen.test.ts` 10 条（多轮廓包围盒/双 `M`/缩放两轮廓、角点↔平滑手柄共线等长）；`editor.test.ts` 32 条（追加第二轮廓、更新首条保留分支）；`schema.test.ts` 15 条（合法/非法 `pathContours`）；`svg.test.ts` 10 条（新增多轮廓只填闭合、开放 `fill="none"`）。
- 完整 `npm run gate` PASS：24 个测试文件 / 151 条测试，MCP selftest 通过；EXE 3,286 KB，2026-11-24 23:23:55；前端 `index-D--MXBsj.css` 58.48 kB、`index-DRVSHOf4.js` 441.97 kB。
- 真实 EXE 多轮廓：复制 `pen-final.groma` 为 `pen-branch.groma`，最大化 1707×1019、100% 缩放，选中 `钢笔 1` 后 `Alt`+点击画出第二条 3 锚点开放轮廓；锚点 5→8、轮廓 1→2；拖第二轮廓首锚点、在线段插点 8→9、`Delete` 回 8，保存成功。`scene.json` 为 `pathContours` 2 条（第一条 5 锚点闭合、第二条 3 锚点开放），`pathAnchors` 仍镜像第一条 5 锚点，`pathData` 含 2 个 `M`；重开恢复 2 条/8 锚点/“1 闭合 / 1 开放”。
- 真实共点分支：另建 `pen-branch-stroke.groma`，在 `钢笔 1` 第一轮廓第 1 锚点 `Alt`+点起笔，再点两下落笔收尾；`pathContours` 2 条，第二条 3 锚点开放、首锚 `(96.26,65.45)` 与第一条首锚完全相同；节点自动补 2px `#221C00` 描边。重开仍为 2 条/8 锚点/1 闭合 1 开放，分支线可见。
- 真实导出：分支项目 `钢笔 1` PNG 1× 605×817（分支为黑色开放线，无隐式填充），SVG 766 B、两个 `<path>`；闭合轮廓 `fill="#D9D9D9"` + 2px 描边，开放轮廓 `fill="none"` + 2px 描边。旧的 `pen-branch` 工程没有重跑导出，`钢笔 1-2.svg` / `钢笔 1@1x-2.png` 仍是填充修正前版本，不能当成开放只描边的证据。
- 真实角点/平滑：复制 `pen-branch.groma` 为 `pen-anchor-type.groma`，双击第一轮廓第 2 锚点，手柄清零、`H` 668.05→641.10，保存重开仍为角点；再次双击还原平滑，手柄共线，`H` 回到 680.53，保存重开保持。驱动脚本 `tools/cdp-pen-branch.mjs` / `cdp-pen-type.mjs` 可复跑。
- UI：`shots/pen-branch-clean-max.png`（共点分支、闭合填充 + 开放黑线、右栏 2 条/8 锚点/1 闭合 1 开放）、`shots/pen-type-final2-max.png`（平滑点、两轮廓、开放轮廓只描边）、`pen-branch-stroke-svg-max.png` / `pen-branch-stroke-png-max.png`（导出）。
- 边界：本节的分支只是“相同坐标起笔”的两条独立轮廓，拖动起点会分开；共享顶点与整条轮廓删除已在 3.9 / 3.10 补齐。平滑手柄固定等长，未支持断开手柄独立调；工程重命名目前需要同步 `scene.json` 的 `name`，只改 `project.json` 顶栏不刷新。

### 3.9 C03 共享顶点（`vertexId` 最小内核）（2026-11-25 已落地）

- 数据：`PathAnchor` 与 `PenAnchor` 都增加可选 `vertexId?: string`；同一节点内 id 重复即共享顶点，旧工程无 id 仍按独立锚点，schema 只要求“存在时非空字符串”，允许重复。
- 几何：`penContoursGeometry`、`pathAnchorsToWorld`、`pathContoursToWorld`、插点/切角重建都保留 `vertexId`；新增 `syncSharedPenVertex(contours, source)` 把源锚点的 `x/y/in/out` 复制到所有同 id 锚点；新增 `removePenVertex(contours, source)` 从每条轮廓移除同 id 锚点，某条不足 2 锚点时整条移除，全部删空返回 `null`；`countSharedPenVertices` 统计跨轮廓引用的顶点数。
- 画布：普通落点与插点生成新 `v<base36>-<seq>`；`Alt`+点已有锚点起分支时复用该锚点 id，旧锚点无 id 时先静默补 id 再起分支；拖锚点/手柄先改目标，再同步所有同 id 锚点，整次拖拽仍是一条撤销；双击切角/平滑也同步所有共享点。
- 反馈：右栏在多轮廓时显示“当前轮廓 第 N / M 条”，有共享顶点时显示“共享顶点 N 个”；画布底部提示补 `Ctrl+Delete`。
- 测试：`pen.test.ts` 12 条（共享 id 同步、删除共享点、几何/世界坐标保留）、`schema.test.ts` 15 条（接受共享 id、拒绝空 id）、`editor.test.ts` 33 条（共享删除与布尔事务）；完整 `npm run gate` PASS：25 个测试文件 / 157 条，MCP selftest 通过；前端 `index-BE5AWfgH.css` 58.73 kB、`index-ByhmZPB3.js` 477.66 kB；EXE 3,296 KB，2026-11-25 07:50:38。
- 真实 EXE 共享拖动：复制 `pen-branch-stroke.groma` 为 `pen-vertex.groma`，`Alt` 点首锚起分支再落两笔，得到 3 轮廓 / 11 锚点（1 闭合 2 开放）；拖动共享首锚 +58/+36 后闭合轮廓与分支首锚由 `96.26,65.45` 同步到 `177.58,115.93`，独立第二轮廓首锚保持 `96.26,65.45`；`scene.json` 中两条轮廓首锚共享 `vertexId:"vmwvbs3cp-1"`；保存重开仍是 3/11、共享顶点 1。
- 真实 EXE 删共享点：复制为 `pen-vertex-del.groma`，选中重叠共享锚点按 `Delete`，锚点 11→9，三条轮廓变为 4 / 3 / 2 个，`scene.json` 同步；另复制 `pen-vertex-undo.groma` 做删除后 `Ctrl+Z`，锚点 9→11、共享顶点恢复 1，保存成功。
- 导出：`钢笔 1-3.svg` 849 B，闭合轮廓 `fill="#D9D9D9"`，开放轮廓 `fill="none"`、均 2px `#221C00`；`钢笔 1@1x-3.png` 605×817 / 28,924 B。
- UI：`shots/pen-vertex-after-max.png`（共享拖动后）、`shots/pen-vertex-final-max.png`（保存重开）、`pen-vertex-svg-max.png` / `pen-vertex-png-max.png`（导出）、`pen-vertex-delete-max.png`（删共享点后 9 锚点）、`pen-vertex-delete-undo-max.png`（撤销回 11 锚点）。
- 边界：这是最小共享顶点，不是完整 `VectorRegion / 区域填充 / 任意图边`；共享点只能同步坐标与手柄，没有跨轮廓的拓扑约束、自动闭合区域或图边遍历。

### 3.10 C03 当前轮廓与整条轮廓删除（2026-11-25 已落地）

- 选择桥：新增 `src/state/pen-selection.ts` 外部 store，`CanvasView` 同步当前锚点 `{nodeId, contour, index}`，`RightPanel` 用 `usePenAnchorSelection` 读取当前轮廓序号，不改场景数据、不产生历史。
- 删除轮廓：钢笔工具下按 `Ctrl/Cmd+Delete` 删除当前整条轮廓；只剩 1 条时拒绝，画布 Toast 2.6 秒提示“至少保留一条轮廓”；成功时 Toast“已删除整条轮廓”，删除动作走编辑器历史，`Ctrl+Z` 只恢复这一条。
- 真实 EXE：`pen-vertex.groma` 当前轮廓第 1/3 条，`Ctrl+Delete` 后 3 轮廓 / 11 锚点→2 轮廓 / 6 锚点；`Ctrl+Z` 恢复 3/11，保存状态“已保存”。
- UI：右栏多轮廓时显示“当前轮廓 第 N / M 条”，提示补“`Ctrl+Delete` 删除整条轮廓”；`shots/pen-vertex-after-max.png` 可见右栏序号与共享顶点数。
- 边界：`Delete` 仍只删一个锚点；`Ctrl+Delete` 只删当前选中轮廓，不能多选轮廓批量删；没有右键菜单/图层树入口。

### 3.11 C04 最小布尔 Union / Subtract（2026-11-25 已落地，3.12 扩展为四布尔）

- 依赖：新增 `polygon-clipping@0.15.7` 与 `src/polygon-clipping.d.ts`；`src/core/boolean.ts` 提供 `booleanEligibility` / `booleanPathNode`。
- 输入：正好 2 个唯一对象，支持 `rect`（圆角用近似弧）、`ellipse`（48 点）、`polygon/star`、闭合钢笔路径；贝塞尔固定 12 段 flatten；开放路径、箭头、文本、图片、带子图层对象拒绝；对象必须至少有一条闭合轮廓。
- 输出：结果为新 `path` 节点，`pathContours` 每个结果环一条闭合轮廓、`fillRule:"evenodd"`，复制首个对象的 fills/strokes/opacity，名称“并集 N / 差集 N”；不修改源对象。
- 历史：`editor.booleanSelected(op)` 用一条 `structure` 历史删除两个源对象并插入结果节点；一次 `Ctrl+Z` 恢复两个源对象，`Ctrl+Shift+Z` 恢复结果。
- 入口：TopBar 在选中 ≥2 对象时显示“并集/差集”；条件不满足时禁用，`title` 给出具体原因；成功 Toast“并集完成 / 差集完成 · 布尔结果已扁平化为折线”。
- 测试：新增 `boolean.test.ts` 3 条、`editor.test.ts` 1 条；完整 gate 25 文件 / 157 条通过，EXE 3,296 KB，2026-11-25 07:50:38。
- 真实 EXE Union：新建 `boolean-union.groma`，画两个重叠矩形，图层树点选 + Shift 多选；结果“并集 1”，1 轮廓 / 8 锚点 / 646×449 / `fillRule:evenodd`；一步撤销恢复两矩形，重做恢复结果；保存重开正常。
- 真实 EXE Subtract：`boolean-subtract.groma` 结果“差集 1”，1 轮廓 / 6 锚点 / 407×379，L 形正确；同样一步撤销/重做；导出 `并集 1.svg` 324 B、`差集 1.svg` 304 B，重开工程后导出仍成功。
- 失败态：`pen-final.groma` 选中两条钢笔（含开放路径），并集/差集均禁用，`title` 为“并集：需要至少一条闭合路径”“差集：需要至少一条闭合路径”；1280 窗口下可视文字“需两条闭合对象”与右侧缩放、导出控制不重叠；1040 最小窗口在 760px CSS 以下收起原因文字，按钮 `title` 保留原因，顶栏无溢出（viewport 679 / 工具条右界 451 / `overflow:0`）。
- UI：`shots/boolean-union-max.png`（并集与 Toast）、`boolean-subtract-max.png`（差集 L 形）、`boolean-union-svg-max.png` / `boolean-subtract-svg-max.png`（重开导出）；后续顶栏截图见 3.12。
- 本节为当时边界：不做 Intersect / Exclude / Divide / Outline / Flatten，不处理 3 个以上对象；差集 subject 取 `selectedIds[0]`，尚未按 z-order 归一；所有曲线固定 12 段 flatten。3.12 已补 Intersect/Exclude、同父级与 z-order 与 3+，3.13 已补 Divide/Outline/Flatten。

### 3.12 C04.2 四布尔、3+ 对象与 z-order、紧凑菜单（2026-11-25 已落地）

- 数据与算法：`BooleanOp` 扩为 `union | subtract | intersect | exclude`，`BOOLEAN_PREFIX` 固定输出“并集 / 差集 / 交集 / 排除 N”；`intersect` 用 `polygonClipping.intersection`、`exclude` 用 `polygonClipping.xor`，其余仍走同一 flatten + `polygon-clipping` 路径。
- 输入约束：至少 2 个唯一对象，必须同一父级，不得有子图层，至少一条闭合轮廓；跨 Frame/Group 布尔直接拒绝，不做隐式提升。
- z-order：源对象按父节点 `children` 顺序排序（数组前为底层、后为上层），`sourceIds` 与几何顺序都按 z-order；差集为“底层减其余对象并集”，不再依赖 `selectedIds[0]` 或点选先后。
- 多对象：`union` / `exclude` 直接 variadic，`subtract` 底层减其余并集，`intersect` 取全部对象交集；3+ 对象仍只产生一个结果节点和一条 `structure` 历史。
- 输出：结果仍是单个 `path` 节点，每条结果环一条闭合轮廓、`fillRule:"evenodd"`，复制底层对象的 fills/strokes/opacity；源对象删除 + 结果插入仍合成一条 `structure` 历史，单步撤销/重做。
- 入口（本节当时）：TopBar 选中 ≥2 时显示四按钮；宽屏 `.bool-wide` 四按钮文字，CSS `max-width:760px` 切到单个“布尔 ▾”按钮；3.13 已改为 7 动作、断点 1180。
- 测试：`boolean.test.ts` 6 条（并集、差集/内孔、交集/排除、反选 z-order、三对象折叠、失败原因），`editor.test.ts` 34 条；完整 gate 25 文件 / 161 条通过，MCP selftest 通过；前端 `index-DNnTPhXM.css` 59.63 kB、`index-B_OAYmV-.js` 479.39 kB；EXE 3,297 KB，2026-11-25 19:52:36。
- 真实 EXE Intersect：`boolean-four.groma` 结果“交集 1”，1 轮廓 / 4 锚点 / 154×295 / evenodd；导出 `交集 1.svg` 286 B。
- 真实 EXE Exclude：`boolean-exclude.groma` 结果“排除 1”，2 轮廓 / 6+6 锚点 / 646×449 / evenodd；导出 `排除 1.svg` 374 B，SVG 两个子路径且 `fill-rule="evenodd"`。
- 真实 EXE z-order：`差集方向验收`（目录 `boolean-zorder.groma`）反选两个矩形（先点“矩形 2”再 Shift“矩形 1”）执行差集，结果仍为底层 矩形1 减上层 矩形2 的 L 形，1 轮廓 / 6 锚点 / 407×379。
- 真实 EXE 紧凑菜单：`boolean-compact.groma`（由 `arrow-final.groma` 复制出的验收副本）在 1040×680 窗口、CSS viewport 679 下只显示“布尔 ▾”；打开菜单四操作均可用，点“并集”后生成“并集 1”（2 轮廓 / 54 锚点 / 520×480），Toast“并集完成 · 布尔结果已扁平化为折线”。
- 真实 EXE 三对象：`boolean-three.groma` 选中“黄色卡片 + 墨色圆 + 墨色横条”三个同父级对象，1040 紧凑菜单点并集生成“并集 1”，3 轮廓 / 102 锚点 / 580×480，三个源对象全部消失，仍有且仅有一条可撤销历史。
- UI：`shots/boolean-four-wide-max.png`（最大化 1707 CSS：四按钮 + 原因到 x1211，右侧导入/导出完整）、`boolean-four-wide-1280.png`（839 CSS：四按钮到 x601，右侧缩放完整，文件名“钢笔…”可见）、`boolean-compact-1040.png`（679 CSS：单“布尔 ▾”+ 四操作菜单）、`boolean-compact-union-1040.png`（菜单执行两对象并集）、`boolean-three-1040.png`（菜单执行三对象并集）；三档均 `overflow:0`，无按钮挤压。
- 边界：3+ 对象已支持；Divide、Outline、Flatten 由 3.13 补齐。同父级仍是限制，跨容器布尔需产品口径；曲线固定 12 段 flatten，结果不可继续编辑曲线。

### 3.13 C04.3 Divide / Flatten / Outline stroke（2026-11-25 已落地）

- 统一入口与数据：`VectorAction = BooleanOp | "divide" | "flatten" | "outline"`；`vectorActionEligibility` 先做同父级、无子图层、闭合轮廓、唯一对象校验，再按动作要求检查对象数；`vectorActionBuild(doc, ids, action, nextId)` 返回 `nodes / sourceIds / removeSourceIds / sourcePatches / parentId / replaceSources`。旧 `booleanPathNode` 保留为单结果兼容包装。
- Divide：按父级 `children` 的 z-order 对 2–8 个对象枚举全部非空子集（`mask = 1..(1<<n)-1`）；每个子集先求 `intersection`，再减去子集外所有对象的 `union`，得到互不重叠区域；每块复制该子集最高层对象的 fills/strokes/opacity，名称“分割 N”，源对象全部删除。空区域跳过；超过 8 个对象拒绝。
- Flatten：把所有源对象的闭合轮廓直接合并为一个 `path`，`fillRule:"nonzero"`，复制底层对象的 fills/strokes/opacity，名称“拍平 N”，源对象删除。重叠轮廓靠 nonzero 覆盖，SVG 同步写 `fill-rule="nonzero"`。
- Outline：对每条实线描边按 `width` 生成描边带：逐边四边形 + 每个凸角的 join 几何（miter 上限 4×half，超限回退 bevel；bevel 三角；round 16 边形），再逐块 union；结果只填充描边颜色/透明度、无描边，名称“描边 N”。每个源对象的每条实线 stroke 生成一个节点；源对象清空 `strokes`，若 `fills` 为空则删除源对象，否则保留填充。虚线、开放轮廓、零描边拒绝；至少 1 个对象即可执行。
- 历史：`editor.vectorSelected(action)` 支持一次插入多个结果节点与 `sourcePatches`，只产生一条 `structure` 历史；`replaceSources=true` 时结果插到最低源对象原索引前；Outline 插到最高源对象之后；`redoRemove=removeSourceIds`、`undoRemove=所有新节点 id`。`editor.booleanSelected(op)` 保留并委托给 `vectorSelected`。
- 稳健性：`nodeFromWorldRings` 过滤面积 `<=1e-6` 的退化环。圆角描边带被 `polygon-clipping` 留下零面积三角时不会成为第 3 条轮廓；描边验收因此稳定为 2 轮廓。
- UI：7 个矢量动作。宽屏（CSS >1180）显示四布尔 + “更多 ▾”（分割/拍平/描边）；窄屏（CSS ≤1180）只显示单个“矢量 ▾”，菜单七项按“布尔 / 分割 / 拍平 / 描边”分组并带分隔线；点遮罩、Esc、选中对象变化关闭；单对象也显示“矢量 ▾”，Outline 可用，Divide/Flatten 禁用并给原因。
- 测试：`boolean.test.ts` 9 条（含 Divide 三区域面积、Flatten 2 轮廓/nonzero、Outline 圆角描边 2 轮廓与源描边清理），`editor.test.ts` 36 条（含 Divide/Outline 一步撤销重做）；定向 45 条通过。完整 `npm run gate` PASS：25 文件 / 166 条，MCP selftest 通过；前端 `index-bURbZLJI.css` 59.82 kB、`index-CUR12QF0.js` 484.68 kB；EXE 3,299 KB，2026-11-25 20:26:05。
- 真实 EXE Divide：`vector-divide.groma`（`arrow-final.groma` 副本，矩形 2 改为与黄色卡片重叠）在最大化 1707 CSS 下选中“黄色卡片 + 墨色横条”，点“更多 ▾ → 分割”：3 个源对象变成“分割 1/2/3”三条闭合路径，全部选中，Toast“分割完成 · 已拆成独立区域路径”；导出“分割 1.svg”320×200 / 519 B，单轮廓、`fill-rule="evenodd"`。1040 窗口（679 CSS）从“矢量 ▾”七项菜单执行同一操作，同样得到 3 条结果。
- 真实 EXE Flatten：`vector-flatten.groma` 同两对象执行“拍平”：只剩“拍平 1”，2 轮廓 / 32 锚点 / 380×260 / `fillRule:nonzero`，源两对象消失；导出“拍平 1.svg”634 B，`fill-rule="nonzero"`、2 个子路径。
- 真实 EXE Outline：`vector-outline.groma` 单对象“黄色卡片”加 12px 红色 miter 描边，执行“描边”：新增“描边 1”，2 轮廓 / 104 锚点 / 332×212，填充 `#FF0000`、无描边；源卡片保留填充、`strokes` 清空；导出“描边 1.svg”1,723 B、2 个子路径。1040 窄屏单对象同样从“矢量 ▾”执行成功。
- UI：`shots/vector-divide-max.png`（1707 CSS：四布尔+更多、3 条分割结果）、`vector-divide-1040.png`（679 CSS：单“矢量 ▾”）、`vector-menu-compact-1040.png`（七项菜单完整）、`vector-menu-1440.png`（946 CSS：单“矢量 ▾”，文件名完整）、`vector-outline-max.png`、`vector-outline-1040.png`、`vector-flatten-max.png`；导出 Toast 见 `vector-divide-svg-max.png`、`vector-flatten-svg-max.png`、`vector-outline-svg-max.png`。
- 边界：Outline 是自研描边带近似，不是 clipper 级布尔；miter 4×half 上限、bevel 三角、round 16 边形；虚线直接拒绝。Flatten 产生的重叠轮廓依赖 nonzero 渲染，曲线仍按 12 段 flatten，结果不可继续编辑贝塞尔曲线。Divide 最多 8 个输入，跨父级不隐式提升。

### 3.14 C05 形状蒙版 + Alpha/亮度蒙版（2026-11-25 已落地）

- 数据：`SceneNode.isMask?: boolean` 与 `maskType?: 'geometry' | 'alpha' | 'luminance'`，缺省 `geometry`；`src/core/mask.ts` 提供 `maskEligibility`、`maskIndexForParent`、`maskForParent`、`maskTypeOf`、`pointInMask`。蒙版必须位于 `frame / section / group` 内，草稿层不能有子图层，必须是 `rect / ellipse / path` 且至少一条闭合轮廓；UI 启用时同父级只允许一个蒙版，且上方必须存在可裁切图层。`schema` 校验父级、类型、`maskType` 枚举与无子图层；删除上层后留下的惰性蒙版仍可保存/重开，不会让工程损坏。
- 语义：蒙版节点自身不绘制，只裁切同父级中位于其上方的兄弟；下方图层不受影响。隐藏蒙版不裁切；锁定蒙版仍裁切。多个轮廓按 `evenodd` 处理，保留路径内孔。轮廓蒙版只取几何；Alpha 蒙版读取蒙版图层的像素透明度；亮度蒙版按 `0.2126R + 0.7152G + 0.0722B` 乘以原 alpha 转成遮罩强度。
- 画布：`drawChildren` 统一处理同父级子图层；几何蒙版用世界坐标 rings 建 `Path2D`，`ctx.clip(path,"evenodd")` 后绘制上方兄弟。Alpha/亮度走 `drawPixelMaskedChildren`：把上方兄弟与蒙版分别画到同尺寸离屏 canvas，`destination-in` 合成后贴回主画布；离屏层继承当前变换与全局 alpha，嵌套容器、画板/区块/编组与编辑器根循环共用。若浏览器缺少离屏或 `getTransform`，退化为几何轮廓裁切，不中断绘制。
- 导出：SVG 几何蒙版用 `<defs><clipPath><path fill-rule="evenodd">` + `<g clip-path>`；Alpha/亮度输出 `<mask maskUnits="userSpaceOnUse" mask-type="alpha|luminance" style="mask-type:...">`，再用 `<g mask="url(#...)">` 包住上方兄弟。画板 PNG/JPG、切片 PNG/JPG、组合图层 PNG 都走同一套 canvas 蒙版裁剪。画板自身 `clipContent` 与蒙版裁剪可叠加。
- 命中：`walkHit` 在蒙版外跳过上方兄弟，避免点到看不见的区域；蒙版自身仍可通过图层树选中，空白蒙版区域也可在画布上点选。**Alpha/亮度命中仍按几何轮廓，不逐像素判定**，这是当前实现边界。
- UI：右栏“蒙版”分组提供“用作蒙版 / 取消蒙版”，禁用时显示具体原因；启用后出现“轮廓 / Alpha / 亮度”三段切换，默认轮廓，并显示“裁切上方 N 个图层”。图层行显示“蒙版”小标签。入口只在候选形状出现，不铺常驻面板。
- 历史：复用 `editor.applyPatch`，启用/取消/切换类型各一条 patch 历史；`Ctrl+Z` 一步恢复。
- 多画板可见区：根级画板加空间索引（`FRAME_INDEX_CELL=512`，单画板最多 64 格，超大画板进 oversized 列表，查询最多 4096 格，视口外扩 48 屏幕像素）。每帧只取视口覆盖网格里的画板候选，再按原 z-order 绘制；索引按画板位置/尺寸/旋转/显隐生成轻量签名，拖动或缩放后自动失效重建。少于 24 个根节点、或根上有蒙版时退回原来的完整 `drawChildren`。600 画板 × 8 子节点、1420×880 视口：30 次平均 **0.14ms**，只绘制 **57 / 5,399** 个节点。
- 测试：`src/core/mask.test.ts` 5 条（资格与唯一性、矩形/椭圆点包含、命中过滤、几何 SVG clipPath、Alpha/亮度 SVG mask）；`schema.test.ts` 16 条（含非法 `maskType`、蒙版父级/类型、惰性/重复蒙版可保存）；`render.bench.test.ts` 2 条（5000 节点 + 600 画板索引/失效）。完整 `npm run gate` PASS，26 文件 / 173 条通过，MCP selftest 通过；CSS `index-BCHVFPQA.css` 60.20 kB、JS `index-kmMm65-c.js` 493.41 kB；EXE 3,301 KB，2026-11-26 07:34:37。
- 真实 EXE：`mask-demo.groma` 用椭圆几何蒙版裁切“蓝色大图层 + 蒙版内文字”；最大化截图见 `shots/mask-final-max.png`，1440 见 `mask-1440.png`，1040 见 `mask-1040.png`。启用后图层显示“蒙版”，右栏提示“裁切上方 2 个图层”；`Ctrl+Z` 恢复未蒙版，重做恢复蒙版。`alpha-demo.groma` 把同一蒙版改为 Alpha，右栏“Alpha”点亮，椭圆内蓝色大图层从实心渐变到透明、蒙版内文字同步淡出，截图 `shots/alpha-final-max.png`；PNG `桌面 1440@1x-3.png` 50,442 B，SVG `桌面 1440-3.svg` 1,421 B（`mask-type="alpha"`），Chromium 渲染与 PNG 一致。`luma-demo.groma` 把蒙版改成黑→白渐变并切到“亮度”，蓝色图层左淡右实，截图 `shots/luma-final-max.png`；PNG 113,855 B，SVG 1,372 B（`mask-type="luminance"`），Chromium 渲染与 PNG 一致。
- 真实导出：几何画板 SVG `桌面 1440.svg` 1,713 B，含 `groma-mask-1` clipPath 与 `fill-rule="evenodd"`，浏览器渲染为椭圆窗口；PNG `桌面 1440@1x-2.png` 1,440×900，画面与 SVG 一致（修复了首版 PNG 导出未走蒙版路径的问题）。
- 边界：不做蒙版组、多个蒙版串联、羽化/扩展、跨父级提升；文本/图片不能直接作为蒙版。复制图层可能带出第二个 `isMask`，渲染只取最上面一个可见蒙版，其余蒙版节点不绘制。Alpha/亮度使用整窗离屏 canvas，多个大蒙版会放大内存与合成成本，后续应按可视包围盒裁小。命中仍是几何。空间索引只作用于根级画板，非裁剪容器若子图层大量越界，仍以画板自身外接框参与候选，边界待补。

### 3.15 C06.2 图片裁剪 + 剪贴板粘贴（2026-11-26 已落地）

- 数据：`SceneNode.imageCrop?: { x, y, w, h }` 存归一化源图区域（0–1），缺省整张图，旧工程不带此字段直接按全图渲染。`src/core/image.ts` 提供 `FULL_IMAGE_CROP`、`MIN_IMAGE_CROP=0.02`、`normalizeImageCrop`（非法/NaN 回全图、越界收拢、最小 2%、round 6 位）、`imageCropOf`、`isFullImageCrop`、`imageSourceRect`、`cropPercent`。`schema` 校验四项有限、`x/y>=0`、`w/h>0`、`x+w<=1.0001`、`y+h<=1.0001`。
- 画布：普通状态 `drawImage(image, sx, sy, sw, sh, x, y, w, h)` 只画裁剪区域；裁剪模式由 `DrawOptions.cropPreviewId` 让该图片临时按 `FULL_IMAGE_CROP` 画整张源图，框外压暗、框内保持原色。`CanvasView` 把 `cropId` 作为渲染依赖。裁剪只改源图可见区域，不移动/缩放节点；替换图片会重置裁剪。
- SVG：不用嵌套 `<svg viewBox>`（Chromium 会退化成整张源图）；当前方案是 `<clipPath>` 裁节点矩形（含圆角）+ 图层绘制放大后的整图（`drawW=node.w/crop.w`、`drawH=node.h/crop.h`、`x=nodeX-crop.x*drawW`、`y=nodeY-crop.y*drawH`）+ `clip-path`。真实 Chromium 渲染与 PNG 一致。
- 交互：双击图片或选中后 `Enter` 进入裁剪；Esc 退出。四角 8px 命中收放，框内拖动平移，最小保留 2%；拖动用 transaction 合成一条撤销；`Ctrl+Z` 回退。检查器提供“裁剪图片/退出裁剪”“恢复原比例”“替换图片”“重置裁剪”，并显示“可见 59% × 39%”。
- 粘贴：全局 `paste` 读 `clipboardData` 里的第一个 `image/*` 文件，非输入框焦点时拦截；调用 `importImageAsset(projectId, file)` 写进 `<工程>/assets`，再用 `editor.insertImage(asset)` 插到当前画板并选中；Toast 显示文件名与原始尺寸。工程未保存、剪贴板不是位图时给出明确提示，不静默失败。
- 测试：新增 `src/core/image.test.ts` 4 条（缺省全图、越界收拢、源像素矩形、节点裁剪归一化）；`schema.test.ts` 17 条（含 `imageCrop` 越界与文本 `letterSpacing`）；`svg.test.ts` 11 条（含裁剪 `clipPath`/放大 image 与 `letter-spacing`）。完整 `npm run gate` PASS，27 文件 / 179 条，MCP selftest 通过；CSS `index-DpScZLvd.css` 60.35 kB、JS `index-GnaOjMl4.js` 501.17 kB；EXE 3,301 KB，2026-11-26 13:29:18。
- 真实 EXE 裁剪：`image-crop.groma` 源图 `assets/lake.jpg` 1881×1254 / 3,640,836 B，节点 1200×600，初值 `{x:.2,y:.18,w:.72,h:.55}`；拖右下角到 59%×39%，`Ctrl+Z` 从 46%×22% 回 59%×39%，Esc 后按钮恢复“裁剪图片”、覆盖层消失。持久化 `{x:.2,y:.18,w:.5915,h:.3864}`；截图 `shots/image-crop-max.png` 可见框外整图压暗（左侧帐篷、右侧小船），框内裁剪区。PNG `桌面 1440@1x-2.png` 1,474,137 B，SVG `桌面 1440-2.svg` 4,855,607 B，均无框外内容，Chromium 渲染与 PNG 一致。
- 真实 EXE 粘贴：`粘贴图片验收.groma` 用页面内 canvas 生成 480×320 PNG 并合成 `ClipboardEvent` 投递，Toast“已粘贴图片 · paste-test.png · 480 × 320”，图层树出现图片行并选中；保存后 `scene.json` 增加 `asset-mwx451tc-1` 与 `image-mwx451td-1`（480×290 起点、480×320），`assets/paste-test.png` 147,882 B。截图 `shots/paste-image-max.png`。
- 边界：图片裁剪命中仍按节点矩形，不按像素；旋转图片的裁剪覆盖层未按旋转处理（渲染本身也未处理旋转）；未做图片填充到形状、裁剪焦点/焦点定位、孤儿资产清理。1040 紧凑窗口的 `适应画板` 仍会停在 7%，是既有适配问题，与本轮功能无关。

### 3.16 C07.1 文本字距（2026-11-26 已落地）

- 数据：`SceneNode.letterSpacing?: number`，单位 px，正负均可，`schema` 限制 `|value| <= 200`；0 时存 `undefined`，旧工程兼容。
- 渲染：Canvas 在绘制文本前设置 `ctx.letterSpacing = "${n}px"`，画布与 PNG/JPG 同步；SVG 文本节点输出 `letter-spacing="n"`，Chromium 与画布一致。
- UI：右栏字号/字重/字距改为三列 `.field-grid.is-triple`；字距字段可直接填、Enter 提交、Esc 还原；拖动文本仍按节点矩形命中。
- 真实 EXE：`文字样式验收.groma` 选中“标题”，字距从 0 改成 6，画布标题字距拉开；保存后 `scene.json` 的 `text-1.letterSpacing` 落盘为 6，重开仍显示 6；导出 `exports/标题.svg` 含 `font-size="96" font-weight="700" letter-spacing="6"`。截图 `shots/text-spacing-max.png`、`text-spacing-reload.png`、`text-spacing-export.png`。
- 测试：`svg.test.ts` 居中文本用例断言 `letter-spacing="2"`；`schema.test.ts` 允许 -2、拒绝 201。全量 gate 27 文件 / 179 条通过。
- 边界：只做整段字距，不做富文本片段字距、字偶距（kerning）覆盖、路径文字与段落/列表。

### 3.17 C06.3 形状图片填充 + 粘贴成填充（2026-11-26 已落地）

- 数据：`SceneNode.imageFill?: { assetId, mode: 'fill' | 'fit', focusX, focusY, opacity }`，只允许 `rect / ellipse / path`；存在时优先于 `fills`，缺省/非法时退回纯色或渐变。`schema` 校验资产存在、模式枚举、焦点 0–1、透明度 0–1；旧工程无此字段直接按原填充渲染。
- 计算：`src/core/imageFill.ts` 的 `imageFillBox` 按原图/形状比例算目标框；`fill` 取 cover（`max` 缩放，按焦点保留溢出区域），`fit` 取 contain（`min` 缩放，按焦点留白）。焦点越界收拢到 0–1，零尺寸图不产生 NaN。
- 画布：矩形按圆角裁剪、椭圆按椭圆裁剪、钢笔按 `Path2D` 与 `fillRule` 裁剪，再 `drawImage`；图片未加载时先 `requestImageAsset` 并回退原填充。路径的图片在局部源坐标绘制，再套用节点自身的平移/缩放。
- SVG：矩形/椭圆输出 `<clipPath>` + `<image>`；钢笔路径把 clipPath 与 image 放进同一 `translate/scale` 组；均使用 `groma-image-fill-N`、`preserveAspectRatio="none"`，不依赖 `<pattern>`。描边仍单独输出，图片填充不吞描边。
- UI：右栏填充区新增“图片填充”块：选择/换图、移除、工程资产缩略图选择器、导入图片、铺满/适应切换、焦点 X/Y。选中单一形状时 `Ctrl+V` 直接写入 `imageFill`，Toast 改为“已填充形状”；未选中形状仍按图片节点插入。图片填充块明确写“图片填充优先于纯色/渐变；移除后恢复”。
- 测试：新增 `src/core/imageFill.test.ts` 4 条（cover 焦点、contain、竖框、零尺寸/越界）；`schema.test.ts` 19 条含图片填充资产/模式；`svg.test.ts` 13 条含图片填充 clipPath/image。全量 `npm test`：28 文件 / 187 条通过；`tsc --noEmit` 与 Vite build 通过。
- 真实 EXE：`粘贴图片验收.groma` 的“黄色卡片”320×200，资产 `paste-test.png` 480×320；选择后点“选择图片”，应用铺满并把焦点 X 改到 25，画布即时显示图片，右栏“铺满”点亮、焦点 25/50；保存后 `scene.json` 落 `imageFill: {assetId:"asset-mwx451tc-1", mode:"fill", focusX:0.25, focusY:0.5, opacity:1}`；截图 `shots/image-fill-max.png`。
- 真实 SVG：导出“黄色卡片.svg”197,695 B，含 `groma-image-fill-1` clipPath 与 `<image x="0" y="-6.67" width="320" height="213.33" ...>`，焦点/cover 计算与 PNG 一致；导出 Toast 截图 `shots/image-fill-export.png`。
- 边界：帧/区块/文本/图片节点不能设 `imageFill`；每节点只支持一张图片填充，不做多层图片叠加、图案平铺、图片蒙版；图片节点自身的裁剪焦点仍未做。

### 3.18 C07.2 段落间距 + 列表 + 字体族建议（2026-11-26 已落地）

- 数据：`SceneNode.paragraphSpacing?: number`（px，0–200）与 `listStyle?: 'none' | 'bullet' | 'number'`；`schema` 校验范围与枚举，旧工程缺省无段距/无列表。
- 渲染：文本按 `\n` 分行；`bullet` 在每行前加 `•  `，`number` 加 `${i+1}.  `；行距 = `fontSize*lineHeight + paragraphSpacing`。Canvas 与 SVG 共用同一规则，SVG 每个后续 `tspan` 的 `dy` 是累计行距。字距、字体、字重、斜体与填充仍照常叠加。
- UI：文本区新增一行三段：`• 列表`、`1. 列表`、`段距`；列表按钮可相互切换、再点关闭。字体族输入框挂 `groma-font-options` datalist，提供 Segoe UI / 微软雅黑 / 苹方 / 思源黑体 / 霞鹜文楷 / Arial / Georgia / Consolas 等常用族，仍允许手输任意 CSS family。
- 测试：`svg.test.ts` 新增数字列表用例，断言 `1.  第一行`、`2.  第二行` 与 `dy="33.4"`；`schema.test.ts` 接受 12px 段距与 number，拒绝非法 `listStyle`。全量 28 文件 / 187 条通过。
- 真实 EXE：`文本列表验收.groma` 标题 3 行、56px、行高 1.4，文本框 1160×420；点“• 列表”、段距 14，画布显示 3 条项目符号且行间拉开；保存后 `scene.json` 的 `listStyle="bullet"`、`paragraphSpacing=14`；截图 `shots/text-list-max.png`。导出 `exports/标题-3.svg` 为 1160×420，三个 `tspan` 分别为 `•  设计稿交付`、`•  组件状态补齐`、`•  导出一致性检查`，后两行 `dy="92.4"`（78.4 行高 + 14 段距）。
- 边界：列表是整个文本块的逐行前缀，不做悬挂缩进、多级列表、列表内富文本；居中/右对齐时标记随整行对齐；不换行自动折行，超长行仍靠文本框裁剪。富文本片段样式与路径文字未做。

### 3.19 D03.1 多投影 + 整层模糊（2026-11-26 已落地）

- 数据：`SceneNode.effects?: Effect[]`，单节点最多 12 条；`drop-shadow` 存 `x/y/blur/color/opacity/visible`，`layer-blur` 存 `blur/visible`。`schema` 校验类型、模糊 0–1000、透明度 0–1、`visible` 布尔；旧工程无字段视为无效果。
- Canvas：有可见效果的节点先画到离屏层，再按 alpha 出投影。每条投影复制节点层、用 `source-in` 填成投影色，按偏移/模糊画回主画布；整层模糊最后用 `ctx.filter: blur()` 合成。离屏像素密度跟主画布（DPR / 导出倍率），并用 `effectsLayer` 抑制画板名等编辑标签。投影/模糊不进入命中、尺寸和图层树。
- SVG：同一批效果输出 `<filter>`，`feDropShadow` 逐条投影，`feGaussianBlur` 做整层模糊，最后 `feMerge` 把每条投影与正文叠回去；filter 区域放到节点包围盒的 -100%～300%，避免大偏移被硬切。
- UI：右栏新增“效果”分组，可“＋ 投影”“＋ 模糊”，每条效果显示/隐藏、移除；投影编辑 X/Y/模糊/颜色/透明度，模糊编辑半径。效果分组挂在画板、矩形/椭圆/钢笔/文本/区块、图片、分组检查器，切片与页面不显示。
- 测试：新增 `src/core/effects.test.ts` 3 条（可见性、外扩、滤镜与投影色）；`schema.test.ts` 增加效果合法/非法（20 条）；`svg.test.ts` 增加 filter 输出（14 条）。全量 29 文件 / 192 条通过，`tsc --noEmit` 与 Vite build 通过。
- 真实 EXE：`效果验收.groma` 的“黄色卡片”320×200，投影 `y=14`、`blur=22`、`#221C00` 50%，整层模糊 3；画布出现柔和边缘与下投影，右栏两条效果卡和值一致，保存重开保留 `scene.json.effects`；性能改动后回归图 `shots/effects-after-perf.png`。
- 真实 SVG：画板导出 `exports/桌面 1440.svg` 1,601 B，含 `<filter id="groma-effect-1">`、`<feDropShadow dx="0" dy="14" stdDeviation="11" flood-color="#221C00" flood-opacity="0.5">` 与 `feGaussianBlur`；Chromium 渲染 `shots/effects-frame-svg-render.png` 与画布一致。同画板 PNG `exports/桌面 1440@1x.png` 76,288 B 也保留投影与模糊。单图层导出 `黄色卡片.svg` 763 B 同样带 filter，但画布尺寸仍按图层 320×200，落在图层外的投影会被裁掉；要完整投影应导出画板/区块。
- 边界：只做投影与整层模糊，不做内阴影、背景模糊、投影扩展（spread）、多层组混合和效果样式；离屏层在超大节点上会限制到 4096px 内（按需降采样），不影响常规画板。

### 3.20 B02.1 Shift+2 选中适配（2026-11-26 已落地）

- 入口：`Shift+1` 全部适配，`Shift+2` 选中适配；顶栏适配按钮有选中时走选区，无选中走画板。两者都复用 `animateViewportTo` 的 180ms 缓出，拖动/滚轮仍即时。
- 计算：`editor.fitSelection()` 取 `selectionBounds`，再用同一 `fitRect` 算目标视口；无选中、边界为空或宽高为 0 时回退 `fitAll()`，不会留下空视口。适配只改视口，不动文档、不进撤销。
- 真实 EXE：`效果验收.groma` 选中“黄色卡片”按 `Shift+2`，视口从 71% 到 321%，卡片完整落在画布中心区域。
- 边界：目前只按未旋转的世界包围盒适配，旋转节点按 AABB；没有 Figma 的触控板双指缩放/旋转手势。

### 3.21 P01 百画板总览不卡（2026-11-26 已落地）

- 问题：200 画板 × 50 子节点，10% 总览滚轮每步 90ms、rAF p95 56.3ms；画板越多越卡。
- 改法：滚轮期间只缩放内容区位图，停手 180ms 再提交 viewport 并做真实重绘；`scale < 0.5` 跳过 <4px 叶子，`scale ≤ 0.3` 跳过画板阴影/名称；低倍与可见画板 >32 的 ≤50% 场景每块根画板走 5% 档位缩略图缓存（64MB 封顶），缓存键含画板 id/档位/DPR，每张记子树对象引用，编辑一块只重建一块；首次总览每帧最多 6 张且 12ms 截止，CanvasView 续帧补齐；左栏行 `memo`、计数按 doc memo、`content-visibility:auto`。
- 真实 EXE：200 画板 10% 宽 40 步滚轮 rAF p95 **0.8ms** / max 3.4ms；600 画板 7% 宽 30 步 p95 **8.0ms** / max 9.0ms；600 画板平移 p95 **1.9ms** / max 21.4ms（一次尖峰，p50 0.9ms）。截图 `shots/perf-200-verified.png`、`shots/perf-600-verified.png`。
- 边界：位图缓存用于低倍与可见画板 >32 的 ≤50% 密集场景；缩略图不反映总览倍率下对子图层的即时编辑，停手后只重建被改的那块；缩放百分比在停手后才更新。

### 3.21.1 P01 百画板编辑不再整批重建（2026-11-26 已落地）

- 旧问题：文档一变，下一次停手总览清空 64MB 缓存重做全部小图；600 画板拖一块，松手重建 600 张、rAF p95 114.4ms；200 画板 p95 77.1ms。
- 改法：缓存从按画板对象改成稳定 id 键，每张记录整棵子树对象引用；命中时逐层比对引用，只有改动画板/子对象不匹配才重建。图片资产异步加载才整批失效。首次总览 6 张/帧补齐，手势中不建图。
- 真实 EXE A/B：200 画板重建 200 张 → **1 张**，p95 **77.1ms → 6.4ms**；600 画板重建 600 张 → **1 张**，p95 **114.4ms → 11.3ms**；两者长帧都从 1 个降到 0。600 冷启动首次 `Shift+1` 600 张在 2.6s 内补齐，p50 12.2ms / p95 23.0ms / max 29.7ms，无 >32ms 长帧。
- 边界：单块重建仍 6–14ms，未搬 Worker；600 图补齐期间约 43fps，不是 60fps。

### 3.21.2 引擎第二刀：选中层、中倍画板小图与建图预算（2026-11-27 已落地）

- 选中层：主画布 `selection:false`，新 `.canvas-selection` 只重绘黄框/手柄；空选中时覆盖层 `display:none`。选中一次不再重画整张场景。
- 中倍画板：`OVERVIEW_BITMAP_SCALE` 0.2→0.5；可见根画板 >32 且 ≤50% 时整块贴小图，命中后只补 1px 边框与画板名；旋转/带效果画板仍走矢量。
- 建图预算：每帧最多 6 张，12ms deadline 超时即停，余下交给 `overviewPending` 下一帧续；拖动/缩放中不建图。
- 真实 EXE：200 冷启动 `Shift+1` 全部 200 张，p95 8.0ms / max 11.4ms；600 冷启动 7% 全部 600 张，p95 20.8ms / max 25.4ms，0 个 >32ms；600 拖一块只重建 1 张，p95 7.7ms；200 拖一块 p95 3.7ms；600 从 7% 到 32% 建 50 张，p95 3.3ms；32% 选中一次 p95 1.0ms、0 张新画布。
- 截图 `shots/engine-200-fit.png`、`shots/engine-600-fit-final.png`、`shots/engine-600-drag-final.png`、`shots/engine-200-drag-final.png`、`shots/engine-600-medium-final.png`、`shots/engine-600-drag-medium-final.png`。
- 边界：中倍贴图不含投影/效果/旋转；拖动时文档在变，场景仍整场重画；600 首次补齐约 2.6s。

### 3.22 D01 多填充 + E01 约束 + F04 样式（2026-11-27 已落地）

- D01：`Paint.visible`；`fills` 数组约定顶层→底层，渲染反向铺；`MAX_FILLS=16`。新增 `src/core/fills.ts`（增删改移/显隐/汇总），Canvas `paintFillStack` 逐层 `save/restore` 并乘 `globalAlpha`，SVG `paintStack` 逐层输出，描边单独补透明填充形状。右栏 `FillEditor` 顶部“填充 · N 层”“添加填充”，每行色块/类型/色标数/显隐/删除，选中层保留原详细编辑与上下移动。修正矩形/椭圆/画板/区块渐变坐标：改按节点屏幕原点 + 缩放创建渐变，避免渐变落在画布原点导致整块取末色（`shots/figma33-gradient.png`）。
- E01：新增 `src/core/constraints.ts`；`patchNode` 在 frame/section 尺寸变化时调用 `applyConstraintsOnResize` 递归子层；`changedDescendants` 把子层变化写进 `PatchItem[]`，`beginTransaction` 快照整棵子树，画布缩放父画板也能一步撤销。右栏 `ConstraintsSection` 两枚下拉，仅父级为 Frame 时显示。
- F04：`StyleKind = fill | stroke | effect | text`；`GromaDoc.styles` + `SceneNode.styleRefs`；`src/core/styles.ts` 负责取/套/比对/偏离类型；编辑器 `createStyle/applyStyle/updateStyle/detachStyle/deleteStyle/renameStyle`，`HistoryEntry.doc` 保存前后整文档，样式增删改可回滚。右栏 `StylesSection` 按节点适用类型列行，支持绑定、存为样式、同步到样式、解除、删除，显示“已绑定 · N 个图层 / 已偏离样式”。
- 真实验收工程 `C:\Users\ASUS\Documents\Groma\Figma33.groma`：1200×760 画板，三张 300×220 卡片（多填充渐变卡、两张共用 `品牌蓝紫` 填充样式卡），选中样式卡 A 后右栏显示 2 层填充、样式绑定 2 图层、约束左右/上下拉伸。截图 `shots/figma33-final.png`（填充栈）、`shots/figma33-final-inspector.png`（样式 + 约束）、`shots/figma33-gradient.png`（渐变修正）。
- 测试：新增 `fills.test.ts` 3、`constraints.test.ts` 3、`styles.test.ts` 2；`schema.test.ts` +3、`svg.test.ts` +1、`editor.test.ts` +3；该刀完成时全量 **37 文件 / 228 tests** 通过。MCP 0.3.2 当时支持 `fills` / `constraints` 写入，selftest `frames=8 · snapshots=8` 通过。
- 边界：D01 图片填充存在时颜色层不绘制；E01 仅 frame/section 子层递归，Group 内子层不跟随；F04 为手动同步语义，无 Grid 样式与重命名 UI。

### 3.23 引擎第三刀：空闲回调预热 600 画板（2026-11-27 已落地）

- `DrawOptions` 新增 `overviewBudget / overviewDeadlineMs / idleOverview`；首帧仍 6 张 / 12ms，空闲回调每片 24 张 / 26ms（`timeout=160`，无 `requestIdleCallback` 回退 rAF），cleanup 同时取消 rAF 与 idle callback。
- 真实 EXE 600 画板 `Shift+1` 冷启动：`created=600`，500ms 内 150 张，rAF `p50 0ms / p95 0.2–0.4ms / max 30.9ms`，`>16ms` 1 个、`>32ms` 0 个，`TaskDuration 711.1ms`。旧第二刀同场景为 500ms 84 张、p95 20.8ms / max 25.4ms。
- 截图 `shots/engine-600-fit-idle-final.png`。边界：建图仍占主线程空闲片，未搬 Worker/磁盘缓存；600 张在 4.2s 窗口内补齐，不是瞬时。

### 3.24 超越 Figma 的第一刀：HTML / 令牌 / 图层 CSS / 版本 diff（2026-11-27 已落地）

- HTML：`ExportFormat` 增加 `html`；新增 `src/render/html.ts` 的 `renderFrameHtml / renderNodeHtml`。画板/区块走 `renderFrameHtml`，任意图层走 `renderNodeHtml`；文字输出为可选中 `<div>`，矩形/椭圆/画板用 CSS 渐变 + 圆角 + 溢出裁剪，钢笔路径复用 `renderNodeSvg` 内联，图片节点/形状图片填充用 `data URL` 内嵌；绝对坐标按画板原点归零，隐藏图层不输出。后端 `groma_export_file` 接受 `html` 并写 UTF-8 文本，导出弹窗第四格式去掉倍率、保留透明背景。
- HTML 验收：真实 EXE 导出 `C:\Users\ASUS\Documents\Groma\Figma33.groma\exports\组件验收画板-2.html`，1200×760 / 3,376 B；Edge 渲染与画板一致，文字清晰、三张卡片渐变/圆角正确；截图 `shots/html-export-ui.png`、`shots/html-export-toast.png`、`shots/html-export-browser.png`。
- CSS 令牌：新增 `src/io/tokens.ts` 的 `styleTokens / styleTokensCss / styleTokensJson`，把 `GromaDoc.styles` 四类命名样式转 `:root { --groma-... }`；多填充按顶层→底层输出，纯色在多层时转 `linear-gradient(color,color)` 以保证 CSS 合法。右栏 `StylesSection` 提供“复制变量”和“导出令牌”；后者复用 `exportTextFile` 一次写 `.css` 与 `.json` 到工程 `exports`，真实 EXE 得到 272 B CSS / 375 B JSON，按钮状态“已导出 CSS + JSON”；截图 `shots/code-tokens.png`。
- 图层 CSS：新增 `src/core/css.ts` 的 `nodeCss(doc, nodeId)`，输出定位尺寸、透明度、变换、圆角、纯色/多渐变、首条描边、投影、整层模糊与文本字体规则；类名由图层名生成（`.样式卡-a`）。右栏 `CssSection` 显示代码块并提供“复制 CSS”，`src/ui/clipboard.ts` 先走 `navigator.clipboard`、失败退回隐藏 textarea；真实 EXE 可信鼠标点击后按钮变“已复制”，截图 `shots/copy-css.png`。
- 版本 diff：新增 `src/core/diff.ts` 的 `diffDocs / diffSummary`，比较节点增删改与子层顺序；`VersionHistory` 选中旧快照时显示“相对当前：+N / -M / ~K”及前 4 个变化图层。真实 EXE 存快照、拖动“样式卡 A”后对旧快照显示 `~1 · 样式卡 A`，截图 `shots/version-diff.png`。
- 测试：新增 `src/render/html.test.ts` 3、`src/io/tokens.test.ts` 2、`src/core/diff.test.ts` 3、`src/core/css.test.ts` 3；该刀完成时全量 **38 文件 / 233 tests** 通过；`dist` JS `index-Fq1ihmWL.js` 557,337 B，CSS `index-COthPGDc.css` 67,252 B；EXE 3,398,656 B（3,319 KB）/ 2026-11-27 20:26:24。
- 边界：HTML 只支持单画板/单图层/本页批量，不支持 Slice；文本仅整段样式，富文本片段、路径文字、离线字体嵌入未做；CSS 令牌只做单主题 `:root`，无多 Mode/别名；版本 diff 是结构级增删改与子层顺序，不做像素级逐帧对比；不做云端协作/账号/评论。

### 3.25 E02 自动布局一期（2026-11-27 已落地）

- 数据：`SceneNode.layout?: AutoLayout`，含 `mode / gap / padding(top,right,bottom,left) / align / justify / hug`；只允许 Frame/Section/Group，旧工程无此字段照旧手动坐标。
- 引擎：`src/core/autoLayout.ts` 的 `layoutSubtree / reflowPageFrom`。先递归子层（内层嵌套先定尺寸），再按主轴累计尺寸、gap、padding、justify 计算位置；交叉轴按 start/center/end/stretch；`hug` 时主轴尺寸包住内容。
- 接线：`patchNode` 在容器自身或父容器带 `layout` 时重排同一页，并回传 `beforeNodes/afterNodes`；`patchItems` 合并父容器与兄弟层变化，撤销一次恢复全部。画布拖动/键盘微调自动布局子层被拦截，尺寸与布局参数仍可改。
- UI：Frame/Section/Group 右栏新增“自动布局”段；关闭态一个“开启自动布局”，开启态“重排 / 关闭”改为图标按钮，横向/纵向用方向图标 + 文字，间距、四边内边距、交叉轴/主轴下拉、适应内容主轴；字段标签改为自适应宽度，右栏文本溢出审计为空。右栏分区内边距 16/18、字段间距 10、按钮组间距 8，填充行显隐/删除改为眼睛/垃圾桶图标并留 6px 间距。
- 验收：真实 EXE 打开 `AutoLayout.groma`，按钮组 4 个 150×64 子层、gap 20、padding 上/下 28 · 右/左 20、交叉轴居中、主轴两端，画布与右栏一致；方向图标、图标按钮与字段标签无溢出；截图 `shots/autolayout-ui-final.png`。选中子层后“布局顺序”从 `1 / 4` 下移到 `2 / 4`，画布与图层树同步，截图 `shots/layout-order-final.png`。
- 子层顺序：新增 `reorder` 命令，选中自动布局子层后在右栏“布局顺序”上移/下移，父容器立即重排；`moveLayoutOrder` 记一条 structure 历史。真实 EXE 从 `1 / 4` 点下移到 `2 / 4`，截图 `shots/layout-order-final.png`。
- 测试：`autoLayout.test.ts` 5 条（新增重排后按新顺序布局并可撤销）；`schema.test.ts` +1 条布局校验；全量 **38 文件 / 234 tests**。MCP 0.3.3 已支持 `layout` 写入并通过 selftest。EXE 3,399,680 B（3,320 KB），2026-11-27 22:04:01。
- 边界：新增子层后不自动重排，需点“重排”；顺序重排已支持右栏按钮，画布拖拽排序未做；未做 Fill/Fixed 全组合、换行、布局网格；容器旋转不参与布局计算。

---


```md
能力 ID：
用户可见结果：
入口（工具栏/菜单/快捷键/右栏）：
数据与文件格式变化（含旧工程兼容）：
撤销与保存重开：
空态 / 禁用 / 错误态：
键盘可达性：
性能预算（拖拽/切页/大工程）：
不做清单（明确这次不碰什么）：
真实验收（EXE 时间、截图、落盘字段）：
```

没有这张单，不开工；没有真实验收，不写“已落地”。

---

## 5 反 Reelix UI 红线（每个功能都要过）

| 红线 | 具体要求 |
| --- | --- |
| 不堆常驻面板 | 现有五区骨架不改；新能力优先进上下文栏、右栏折叠分组、命令面板、独立服务 |
| 不铺“功能目录” | 未实现的功能不显示；不拿灰按钮/“稍后开放”占位 |
| 不一屏全展开 | 右栏分组默认折叠；效果/填充/描边用“添加”渐进披露；同时可见分组有上限 |
| 不抢画布 | 面板可折叠；最小窗口下画布不被挤到 0 宽；三档窗口无横向溢出 |
| 不造第二套视觉 | 只用现有令牌：中性底、单一品牌黄、6/8/12/16 圆角、12/13/14 字号、4 的倍数间距 |
| 不做假动效 | 动效只解释状态变化；不做循环光效、重阴影、backdrop-filter；`prefers-reduced-motion` 必须生效 |
| 不阻塞 UI | 超过一帧的活必须有进度/取消/降级；重活不进拖拽热路径 |
| 不牺牲可读性 | 单行文本 `min-width:0` + 省略；行高给足；数字输入可拖/滚/直填 |
| 不把局部功能做成新模式 | 只有 Prototype/Dev Mode/Motion 这类确实改变工作目标的能力才允许独立页签 |
| 不跳过空态 | 每个新面板先写空态、禁用原因、错误提示，再写正常态 |

**Reelix 加强版的具体样子（禁止）**：顶栏塞 20 个图标、右栏一屏 8 个展开分组、每个功能一个常驻面板、功能表很满但一半是灰的、EXE 比源码旧。出现任意一条，这一刀返工。

---

## 6 完成判定（缺一不算）

1. 入口真实存在，键盘可达。
2. 有可见结果，落盘字段可查。
3. 撤销只退一步，重做能回来。
4. 保存 → 关窗 → 重开一致；旧工程能打开。
5. 空态/禁用/错误态都有中文说明。
6. 三档窗口（1440×900 / 1280×800 / 1040×680）无溢出、无面板互压。
7. 真实 EXE 截图，EXE 时间晚于全部源码。
8. `npm run gate` 全绿；测试数只增不减。
9. 没有新增假按钮、假路径、假成功。
10. UI 过第 5 节红线。

---

## 7 一页结论

Groma 的对手不是“功能更多的 Figma 皮肤”，而是**能把 Figma 的结构能力做完整、又保持本地工具克制感的免费工作台**。

- 先把页面/区块/版本这些文件结构做对；
- 再把矢量/外观/样式/变量这些对象与 token 做对；
- 再把约束/Auto Layout/组件这些布局与复用做对；
- 最后才做原型、Dev Mode、协作与融合。

**A02 全链路（缩略图/跨页搜索/页级视口持久化）、A05 版本浏览回滚、A03 Section 基础链路、A08 PNG/JPG/SVG 批量导出与导出弹窗单焦点重排、图片节点/工程资产层已落地；外部软件工程级导入只留入口，下一刀补选区回传、图片填充/裁剪与 A07 粘贴/拖放，随后再碰组件/变量，仍不从面板数量开始。**





