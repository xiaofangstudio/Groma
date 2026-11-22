# Figma 功能蒸馏参考（Groma 立项依据）

> 来源：小方工作室整理的多 AI 蒸馏结果 ｜ 收录日期 2026-11-07
> 范围：截至 2026-11 的 Figma Design / Dev Mode / FigJam / Slides / Draw / Sites / Buzz / 开发者生态 / 企业管理
> 已剔除：Figma AI（First Draft）、Figma Make、FigJam AI、AI 生图、MCP 智能体、AI 代码补全等一切 AI 能力
>
> 用途：Groma 功能分期的功能底本（见仓库根 README 第四节）。Groma 红线（无 AI、无账号云协作、不做壳产品）在此文档之上再裁剪。

## 0. 产品矩阵

| 产品 | 定位 |
| --- | --- |
| Figma Design | UI/UX 矢量设计主编辑器 |
| Dev Mode | Design 文件内的开发者检视/交付模式（可切换角色） |
| FigJam | 在线白板，协作脑暴/流程图/工作坊 |
| Figma Slides | 演示文稿（类 Keynote） |
| Figma Draw | 插画/绘画模式（嵌在 Design 里，笔刷+铅笔+可变粗细描边） |
| Figma Sites | 用 Design 工具直接做响应式网站并发布（Config 2025 beta） |
| Figma Buzz | 品牌营销资产库，市场团队从模板拉社媒图/广告（Config 2025 beta） |
| 开发者层 | Plugin API / Widget API / REST API / Webhooks / Code Connect |

套餐：Starter（免费）/ Professional / Organization / Enterprise。

## 1. 文件、画布、导航

### 1.1 文件层级

- Dashboard：Recents、Drafts（个人草稿）、Team projects、Shared with me、Deleted（回收站 30 天）
- 文件类型：Design 文件、FigJam 文件、Slides 文件
- Pages（页面）：单个 Design 文件内可建多页，左侧 Pages 面板切换；每页独立画布；可重命名/拖拽排序/复制/删除
- Sections（区块）：画布上画矩形 Section 把一组 Frame 包起来；可命名、折叠、设背景色/背景模糊、设为网格排列、导出时整体打包
- Frames（画板）：
  - 设备预设：iPhone（全系列）、Android、Desktop、Tablet、Watch、TV、Social 尺寸、Film 尺寸
  - 自定义宽高、方向
  - 无限嵌套
  - 圆角、背景填充、背景模糊、Clip content 开关
  - 滚动方向设置（无/垂直/水平/双向，配合原型可滚动）

### 1.2 画布导航

- 缩放：滚轮 / Ctrl加减 / Shift+1 全部适应 / Shift+2 选中适应 / Ctrl+0 100%
- 平移：空格+拖拽 / 鼠标中键 / 触控板双指
- Minimap：左下角小地图，缩略全页，可拖拽定位、点击跳转
- Rulers：Ctrl+Shift+R 开关，顶部/左侧刻度
- Guides（参考线）：从标尺拖出，水平/垂直，可锁定、隐藏
- Pixel Grid：放大到阈值自动出现，Ctrl+' 开关
- Layout Grid（布局网格）：Frame 内加，三种——Columns（列）、Rows（行）、Grid（点阵）；可设列数/列宽/沟距/外边距/颜色/透明度/是否居中外边距
- Smart Guides：拖动时自动显示与相邻元素的对齐线、间距数值、居中黄线
- Snap（吸附）：吸附到网格、参考线、其他元素边缘/中心/间距；可在菜单里临时关闭
- Outline view：Ctrl+Shift+\ 切换只看轮廓线，便于看穿嵌套

### 1.3 历史与版本

- Version History：无限快照；自动保存 + 手动命名版本；可加描述
- 回滚任意版本、复制旧版本内容到当前、查看谁改了什么
- Branching & Merging：从主文件拉分支独立编辑；提 Review；Reviewer 可 Approve 或 Suggest changes；Merge 回主干后分支归档；冲突检测
- Deleted 文件：30 天回收站可恢复

## 2. 工具栏（Toolbar）每一个工具

从左到右：

1. Move / Select（V）：选择、框选、移动；按住 Ctrl 可穿透选择内层
2. Frame（F）：画画板，拖出后选尺寸
3. Slice（S）：切图区域，用于导出
4. T / Text（T）：文本工具；单击创建自适应宽度文本框，拖拽创建固定宽文本框
5. Pen（P）：钢笔，贝塞尔曲线，支持角点/平滑点/对称点切换
6. Pencil（Shift+P）：铅笔手绘，自动平滑
7. Brush（Draw 模式下）：笔刷，支持多种笔刷样式（stretch/scatter/dynamic）
8. Shape tools：
   - Rectangle（R）矩形
   - Line（L）直线
   - Arrow（→）箭头（FigJam 里更强）
   - Ellipse（O）椭圆/圆
   - Polygon 多边形（可变数）
   - Star 星形（可变数）
   - Triangle 三角形
9. Comment（C）：评论
10. Shapes menu：插入图片、FigJam 转 Figma 占位、录制等
11. 后退/前进：历史导航
12. Show grid：像素网格开关
13. Plugins / Widgets：插件入口
14. Share：分享按钮
15. Present：播放原型
16. 右侧切换：Design / Prototype / Dev Mode 三 tab

## 3. 左侧边栏

### 3.1 Pages 面板

页面列表，点下拉可新建/复制/重命名/删除页面。

### 3.2 Layers（图层）面板

- 树形结构展示当前页所有对象
- 每层有图标区分类型：Frame、Group、Component、Instance、Text、Vector、Boolean、Rectangle、Ellipse、Line、Star、Polygon、Slice、Connector（FigJam）、Sticky（FigJam）
- 每层右侧：眼睛（隐藏/显示）、锁（锁定）
- 拖拽改层级顺序、拖拽进/出 Frame/Group
- 右键菜单：Group（Ctrl+G）、Ungroup（Ctrl+Shift+G）、Frame selection（Ctrl+Alt+G）、Rename、Duplicate（Ctrl+D）、Delete、Export、Copy/Paste、Flatten、Outline stroke、Flatten selection、Replace symbol、Detach instance、Copy as CSS/SVG/PNG
- 搜索框：按图层名搜索
- 多选：Ctrl 点选、Shift 连选
- 小眼睛可批量隐藏
- Assets 面板（切到 Assets tab）：本团队库 + 个人库的组件、变量、样式，可拖拽到画布；可搜索、可设为 Default 主库

## 4. 右侧属性面板（Design tab）

选中对象后显示，从上到下：

### 4.1 位置与尺寸

- X / Y 坐标
- W / H 宽高
- 锁比例（等比缩放）
- 旋转角度
- 对齐：左/中/右对齐、顶/中/底对齐（相对于画布或父级）
- Distribution：水平等距/垂直等距
- Constraints（约束）：元素在 Frame 尺寸变化时如何响应——左/右/居中/左右拉伸、上/下/居中/上下拉伸
- Layout Mode（Auto Layout）：见第 7 节

### 4.2 Appearance

- Fill（填充）：可加多个 fill，每种类型：
  - Solid 纯色（HEX/RGB/HSL）
  - Linear gradient 线性渐变
  - Radial gradient 径向渐变
  - Angular gradient 角度渐变
  - Diamond gradient 菱形渐变
  - Image fill 图片填充（fill/fit/stretch/tile 四种模式，可调焦点）
  - Pattern fill 图案填充（Draw 新增）
- 混合模式（Normal/Multiply/Screen/Overlay/Darken/Lighten/Color Dodge/Color Burn/Difference/Exclusion/Hue/Saturation/Color/Luminosity 全套）
- 透明度 Opacity
- Stroke（描边）：
  - 颜色/渐变/图片描边
  - 粗细
  - 对齐：内侧/居中/外侧
  - 端点：平头/圆头/方头
  - 拐角：尖角/圆角/斜角
  - 虚线（dash pattern 可自定义数值）
  - Width profile / Variable width：压感模拟笔锋，可沿路径逐点调粗细
  - Dynamic stroke（Draw）：动态笔刷描边
  - Scatter brush / Stretch brush（Draw）
  - Outline stroke（把描边转成填充形状）
- Effects（效果）：可加多个
  - Drop shadow 投影（X/Y/模糊/扩散/颜色）
  - Inner shadow 内阴影
  - Layer blur 图层模糊
  - Background blur 背景模糊（毛玻璃）
- Opacity：整体不透明度
- Blend mode：整体混合模式

### 4.3 Text（选中文本时）

- 字体家族（本地字体 + Figma 托管字体 + Google Fonts）
- 字重、字号、行高（auto/固定）
- 字间距、段落间距
- 对齐：左/中/右/两端
- 文本装饰：下划线、删除线、大写/小写/首字母大写
- 列表（无序/有序）
- Text box types：Auto width / Auto height / Fixed size
- Text on path（Draw）：文字沿路径排列
- 富文本：同一段落内可局部改字号/颜色/字重
- 链接：文本可加超链接

### 4.4 Export（导出）

- 可加多个导出预设
- 格式：PNG、JPG、SVG、PDF
- 倍率：0.5x、1x、2x、3x、4x
- SVG 选项：Outline text、Simplify strokes、Include id attribute
- PNG 选项：透明背景
- JPG 选项：质量
- Copy/Paste as：PNG、SVG、CSS、PDF
- 批量导出选中所有图层

## 5. 矢量与形状编辑

### 5.1 Pen 工具

- 单击加角点，拖拽加贝塞尔手柄
- 快捷键切手柄：Ctrl 拖手柄独立调整
- 锚点类型：角点、平滑点、对称点
- 路径操作：闭合路径、继续编辑路径
- Vector Networks（矢量网络）：一个节点可连出多条路径（branching），区别于传统单路径
- Split vector：右键把 vector network 拆成单路径
- 锚点编辑：拖动锚点、删锚点、加锚点（钢笔靠近路径自动变+号）、转换锚点类型

### 5.2 Boolean Operations（布尔运算）

四种，可嵌套：

- Union（合并）：Ctrl+Alt+U，合并外轮廓
- Subtract（减去）：Ctrl+Alt+S，顶层挖空底层
- Intersect（相交）：Ctrl+Alt+I，只保留交集
- Exclude（差集）：Ctrl+Alt+E，保留非交集
- Boolean group 可双击进入编辑原始形状
- Flatten：把布尔/组合拍平成单路径
- Outline stroke：描边转形状

## 6. 组件系统（Components）

### 6.1 Component 基础

- Component（主组件）：Ctrl+Alt+K 创建，紫色四菱角图标
- Instance（实例）：从主组件拖出来的副本，绿色
- Detach instance：断开与主组件的连接
- Swap instance：右键换另一个组件
- 主组件改了，所有实例实时同步
- 实例可 Override（覆盖）：文本、颜色、图片、可见性、尺寸、Auto Layout 子级

### 6.2 Variants（变体）

- 一个 Component Set 里装多个变体，属性如 Size=Small|Medium|Large、State=Default|Hover|Pressed|Disabled
- 属性类型：Boolean、Text、Numeric、Variant key
- 排列：可在 Component Set 里自由拖动排列
- 拖实例到画布时可在右侧面板切属性组合
- 嵌套组件：组件里套组件

### 6.3 Libraries（库）

- 团队库（Team Library）：发布到团队，全团队可拖拽使用
- 发布时可选择性发布组件/样式/变量
- 库更新时所有使用处出现 "Update" 提示，可一键更新或选择性更新
- 个人库：自己文件间复用
- Library analytics：看组件被用了多少次、谁在用

## 7. Auto Layout（自动布局）

- Frame 上加 Auto Layout 后变成弹性盒子，类似 CSS Flexbox
- 方向：水平 / 垂直
- Padding：上/右/下/左（可锁统一值）
- Gap（间距）：子元素之间
- 对齐：子元素主轴/交叉轴对齐
- 子元素自动排列，删除/添加自动重排
- 嵌套 Auto Layout：无限嵌套
- Resizing：子元素可设 Hug（包裹内容）/ Fill（填满父级）/ Fixed（固定）
- 文本自动撑开高度
- 可加固定子元素间距
- 响应式：配合 Constraints 和可变宽度可做断点预览
- 导出的 CSS 就是 flexbox

## 8. 变量与样式（Variables & Styles）

### 8.1 Variables（变量）

- 类型：Color（颜色）、Number（数字：间距/字号/圆角）、String（字符串）、Boolean、Float（缓动）
- Variable collections：变量集合，每个集合可有多个 Modes（模式），如 Light/Dark、Mobile/Desktop
- 一个 Frame 可指定用哪个 Mode，整棵子树自动切值
- 变量可互相引用（spacing-md = spacing-sm * 2）
- 变量绑定到：Fill、Stroke、字号、间距、圆角、模糊、Auto Layout gap、原型里的表达式
- 发布为团队库，同步给全团队
- Design tokens：直接对接代码侧 token

### 8.2 Styles（样式）

- 四种本地样式：
  - Paint Styles（颜色/渐变）
  - Text Styles（字体样式）
  - Effect Styles（阴影/模糊）
  - Grid Styles（布局网格）
- 样式可重命名、分组（用 / 命名空间如 buttons/primary）
- 样式也可发布到团队库

## 9. 原型系统（Prototyping）

右侧 Prototype tab。

### 9.1 Interaction（交互）

每个交互 = Trigger（触发器） + Action（动作） + Destination（目的地）

Triggers（触发器）：

- On tap / On click（点击）
- On drag（拖拽）
- On hover（悬停）
- On press down / On press up
- On while hovering / On while pressing
- On key press（键盘按键，可指定键）
- On gamepad button
- On text input（输入框）
- On focus / On blur
- On page load（页面加载）
- On timer（定时，自定义毫秒）
- On document mouse enter / leave
- On anchor（滚动到锚点）

Actions（动作）：

- Navigate to：跳转到另一个 Frame
- Overlays：以浮层形式弹出 Frame（modal/bottom sheet/tooltip），可设背景遮罩、点击遮罩关闭、固定位置
- Swap：在当前位置替换一个子 Frame（tab 切换）
- Scroll to：滚动到某元素
- Open link：打开 URL
- Open prototype：跳到另一个原型文件
- Close overlay：关闭浮层
- Go back：返回上一页
- Set variable：设置变量值（支持表达式 volumeLevel + 10、width * 1.5）
- Conditional：条件判断（if/else，基于变量）
- Loop：循环
- Start/Stop device：设备能力（震动等）
- Play audio：播放音频
- Speak text：TTS（系统朗读）
- Copy to clipboard

### 9.2 Animation（转场动画）

- 类型：Instant（无动画）、Dissolve（淡入淡出）、Move in/out/to from（方向可设上下左右）、Slide in/out/to from、Push、Smart animate（智能动画，自动补间相同图层的位置变化）
- 时长：0–60s
- 缓动曲线：Linear、Ease in/out/in-out、自定义三次贝塞尔
- 叠加：多个动画可叠加

### 9.3 原型播放

- Present 模式：全屏交互
- 设备边框预览（iPhone/Android 外壳）
- 背景色/背景模糊
- 共享链接：可设密码、查看权限、是否允许评论（Groma 本地版裁剪为本地导出 HTML/EXE 预览）
- 原型里可嵌评论
- 多个 Starting point：一个文件里可设多个起始 Frame
- Prototype demo：可录屏

## 10. Dev Mode（开发者模式）

Design 文件右上角切到 Dev Mode，界面变成开发者专用。

### 10.1 Inspect 面板

- 选中图层看所有属性：尺寸、位置、颜色、字号、间距、圆角、阴影、字体、行高
- 自动生成代码：
  - CSS
  - iOS Swift（UIKit / SwiftUI）
  - Android XML / Compose
- 可复制单行属性
- Assets 面板：列出所有图片/图标/GIF/MP4，可直接下载原分辨率文件
- Compare changes：对比当前版本与上次查看时的差异（视觉 diff + 代码 diff）
- 可在 Layout guides、Rulers、Layer outlines 之间切换辅助显示

### 10.2 状态与标注

- Statuses：给 Frame 标状态——Ready for dev、In progress、Completed、Rework
- Annotations：开发者/设计师加文字标注（备注、说明、链接）
- 可把 Frame 链接到 Jira/Linear/GitHub issue
- Code Connect：把 Figma 组件映射到真实代码组件（React/Vue 等），Inspect 里直接显示真实代码用法和文档链接

### 10.3 其他

- Focus view：专注看单个 Frame
- 探索组件所有变体而不进入编辑
- Figma for VS Code 扩展：在 VS Code 里直接看设计、看评论、贴代码片段
- 与 Storybook/Jira/GitHub 集成

## 11. FigJam（白板）

> Groma 立项决定不做此壳产品，本节仅作白板能力参考（对应待确认问题 2：是否单独立项）。

### 11.1 基础对象

- Sticky notes（便签）：彩色，可写字，自动整理
- Shapes：矩形、圆、菱形、箭头、三角形等
- Text：自由文本
- Doodle / Highlighter（画笔/荧光笔）：手绘
- Stamps（印章）：点赞、星号、箭头、X、问号等表情印章
- Connectors（连接线）：带箭头，自动吸附对象边缘，可弯曲/直线，可加标签
- Images / Video / GIFs：直接粘贴
- Files：嵌入 PDF、文档
- Washi tape（和纸胶带）：装饰
- Stickers：贴纸装饰

### 11.2 协作工具

- Voting（投票）：发起匿名投票，所有人用印章投，结束后公开结果
- Timer（计时器）：倒计时，全员可见
- Music：内置背景音乐（Lofi 等）
- Reactions：表情反应飘屏
- Cursors：实时看到其他人光标和名字
- Follow mode：跟随某人的视角
- Photobooth widget：签到拍照

### 11.3 Widgets（小组件）

- 社区 Widget 市场：Asana、Jira 集成、倒计时、骰子、抽奖、思维导图、流程图模板
- Widget 是可交互的 mini app

### 11.4 其他

- 模板库：retros、journey map、mind map、Gantt、OKR、用户画像等几百个模板
- iPad 支持 Apple Pencil
- 可导出 PNG/PDF
- 可把 FigJam 内容转成 Figma Design Frame（右键）

## 12. Figma Slides

> Groma 立项决定不做（Lanterna 覆盖演示文稿），本节仅作参考。

- 类 Keynote 编辑器
- 左侧幻灯片缩略图列表，可拖拽排序、复制、删除
- 每个 Slide 自由放：文本、图片、视频、形状、表格、代码块、图表
- Slide transitions（切换动画）：None、Dissolve、Slide from left/right/top/bottom、Push、Morph 等；可整体应用或单页设
- Object animation：单个对象可设进入/强调/退出动画，延迟和时长
- Presenter notes（演讲者备注）：支持 Markdown（粗体/斜体/列表）
- Presenter view：副屏看备注，主屏放幻灯片
- 全屏演示、幻灯片编号、背景设置、可嵌入视频
- 可复制 Figma Design 内容过来
- 导出 PDF、共享链接查看

## 13. Figma Draw（插画模式）

> Groma 不单做插画模式（Vecora 覆盖插画），但其中「文字沿路径」「可变宽度描边」可择机纳入。

- 内嵌在 Design 文件里的绘画模式
- Pencil 铅笔：手绘线稿，自动平滑
- Brush 笔刷：多种笔刷样式（stretch brush 拉伸笔刷、scatter brush 散点笔刷）、压感灵敏度
- Variable width stroke：沿路径逐点调整描边粗细（模拟毛笔笔锋）
- Width profiles：预设笔锋曲线（圆头/尖尾/双尖等）
- Dynamic stroke：动态笔刷效果
- Text on path：文字沿任意路径排列
- Transform groups：把一组矢量打包做变换
- 所有 Design 的组件/颜色/变量体系都能用
- 导出 PNG/SVG/PDF

## 14. Figma Sites（网站发布）

> Groma 立项决定不做，本节仅存档。

- 用 Design 的 Frame 当网页
- Auto Layout + Constraints 做响应式：同一套设计自动适配桌面/平板/手机
- Blocks（区块）：预设导航栏、Hero、定价表、Footer 等网页块
- 可从 Figma Design 复制粘贴过来
- 原型交互直接变成网页交互（导航、按钮跳转）
- 一键发布到 figma.site 子域名
- 可自定义 SEO 标题、描述、Open Graph 图
- 响应式断点可视化
- 不需要写代码

## 15. Figma Buzz（品牌资产）

> Groma 立项决定不做，本节仅存档。

- 给市场/品牌团队用的简化版 Design
- Templates：品牌设计师做好模板发布，市场同事不能改结构，只能换文案/图片/颜色
- 预设尺寸：Instagram 帖子/Story、TikTok、YouTube 缩略图、X 帖子、LinkedIn、数字广告横幅
- 品牌资产库：Logo、品牌色、字体统一锁定
- 资产发布后队友从库拖拽取用
- 支持插件、批量导出

## 16. 协作与评论

> Groma v1.0 为本地单机版，本节仅存档（局域网无账号协作见待确认问题 1）。

- 实时多人编辑：单文件最多 200 人同时编辑、500 人参与、200 个光标
- 每个人有彩色光标和名字标签
- Comments（评论）：点任何对象加评论、支持 @提及、线程回复、解决 Resolve、时间戳定位、原型播放时也能评论
- Cursors & Views：看到其他人在看哪
- Follow：跟随某人视角
- Presence sidebar：当前谁在文件里
- 分享权限：Full editor / Dev / View only；链接分享；密码保护

## 17. 导出与复制

- 导出格式：PNG（1x–4x）、JPG（质量可调）、SVG、PDF
- Copy as：PNG、SVG、CSS、PDF
- Slice 切图：框选区域精确导出
- 导出所有选中图层为 zip
- Dev Mode Assets 面板直接下载原图/GIF/MP4
- 导入：
  - 导入 Sketch 文件（.sketch）
  - 导入 Figma 旧版文件
  - 粘贴 SVG 代码
  - 粘贴图片（PNG/JPG/GIF/WebP）
  - 粘贴文字自动转文本

## 18. 字体

- 内置 Google Fonts 全量
- 本地字体：通过桌面端本地字体服务使用系统字体
- 字体加载、搜索、收藏
- Groma 采用：本地字体服务 + 内置开源中文字体子集（待确认问题 4）

## 19. 开发者生态

### 19.1 Plugin API

- 在编辑器里跑插件，JS/TS 写
- 可读可写文件节点
- 官方 UI 库
- 几千个社区插件：图标库、插画库、快速占位图、图标处理、材质生成、流程图、翻译、动画等
- Groma 采用：本地加载插件，无市场

### 19.2 Widget API

- 在 FigJam 里跑的交互式小组件，多人实时同步状态
- Groma 不做（FigJam 不做）

### 19.3 REST API

- 读文件结构（JSON 节点树）、评论读写、团队/项目/文件列表、版本历史、导出图片（render）、读取库组件
- Groma 本地版不需要；文件格式 JSON 即满足二次开发

### 19.4 Webhooks

- 订阅事件：FILE_VERSION_UPDATE、LIBRARY_PUBLISH、FILE_COMMENT 等
- Groma 不做（无云端）

### 19.5 Code Connect

- 设计组件与代码组件双向映射，Dev Mode 里看真实代码用法
- Groma 可择机做「组件映射到本地代码片段」

## 20. 企业管理

> Groma 不做（无账号体系），本节仅存档。

- 组织架构：Organization → Teams → Projects → Files 四级；多级角色；Domains 自动认领
- 登录与安全：SAML SSO、SCIM 自动 provisioning、SSO enforcement、Guest access
- 治理：Activity logs、Library management、Community moderation、Billing 座位管理

## 21. 平台与客户端

- Web 版：Chrome/Edge/Firefox/Safari 全支持
- 桌面端：macOS / Windows，支持本地字体
- iPad 版：支持 Apple Pencil、触摸
- 移动查看：iOS/Android App，只能查看原型和文件，不能编辑
- VS Code 扩展、Jira/Slack 集成
- Groma 采用：Windows 桌面端优先（Tauri 2），全家族一致

## 22. 社区

> Groma 不做市场，本节仅存档。

- Figma Community：免费/付费文件、插件、Widget、模板、课程
- 可复制他人文件到自己工作区
- 作者可发布插件/Widget 赚钱
- Community 里搜 UI Kit、图标集、插画集、流程图模板

## 23. 高频快捷键速查

> Groma 键位照此同款（待确认问题 6），Ctrl 对应 Figma 的 Ctrl（Windows）。

| 快捷键 | 功能 |
| --- | --- |
| V | 选择 |
| F | Frame |
| R | 矩形 |
| L | 直线 |
| O | 椭圆 |
| T | 文本 |
| P | 钢笔 |
| S | Slice |
| C | 评论 |
| Ctrl+G | 编组 |
| Ctrl+Shift+G | 取消编组 |
| Ctrl+Alt+G | 用 Frame 包裹 |
| Ctrl+D | 复制 |
| Ctrl+\ | 切换 UI/左侧栏 |
| Ctrl+Alt+U/S/I/E | 四种布尔 |
| Ctrl+Alt+K | 创建组件 |
| Ctrl+/ | 插件菜单 |
| Space | 抓手平移 |
| Shift+1 | 全部适应 |
| Shift+2 | 选中适应 |
| Ctrl+0 | 100% |

## 24. 蒸馏结论（原文）

核心值得抄的骨架是：**Pages/Sections/Frames 三层画布 + 左侧 Layers/Assets + 右侧 Design/Prototype/Dev Mode 三 tab + Auto Layout + Components/Variants/Variables 三件套 + 多人实时光标 + 评论 + 版本历史**。其他 FigJam/Slides/Sites/Buzz 都是在这个内核上长出来的壳。

> Groma 裁剪：多人实时光标与评论不做（本地单机版），其余骨架全收；壳产品（FigJam/Slides/Sites/Buzz）不做。
