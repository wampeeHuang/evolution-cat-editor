# 进化猫内容工作台

通用工具代码权威源在本目录，用户授权从内容期次迁移。内容根来自config.json，仅发现其直接子目录中schema=evolution-cat-photo-v2的index.html。不改其他应用、字体提供方或未兼容旧内容。

保存以articleId+HTML哈希检查，409不得静默重试或覆盖。草稿按独立URL隔离。每篇锁保护保存/正式输出，单worker导出队列保留不可变快照；新稿保存须阻止旧快照覆盖根目录发布图。

web/为通用编辑组件，server.py/render.cjs为服务/PNG渲染。_runtime仅工具自有任务/隔离测试，不能复制用户私有素材进Git。新期仍保留本地资产用于file浏览，在线组件由工具统一提供。更新VERSION/CHANGELOG和HANDOFF。验证两篇独立保存、同篇冲突、并发导出、路径隔离、实际PNG；不以状态标签证明成功。仅监听127.0.0.1:8797，工具架按需启停不自动启动。迁移与调试不得覆盖用户未保存内容。

局部授权例外：D:/tools/CLAUDE.md原仅准入第三方克隆工具；用户本轮明确要求自建通用服务迁入本目录，按该明确授权执行，不扩大到其他自建项目。用户已授权工具独立建仓：Git根为D:/tools/evolution-cat-editor，远端wampeeHuang/evolution-cat-editor，main分支；后续仅在本工具仓提交，不能在D:/tools总仓提交本工具变更。_runtime测试/用户素材不进Git。

首页分类与最近打开时间的唯一来源为_runtime/catalog-metadata.json，属持久用户管理数据，不作为可清理缓存；图卡内容仍以各篇document-state为准。创建时间显示目录创建时间，不倒填历史打开记录。


自由图卡：web/runtime/editor.html为第三方MIT运行时的共享宿主壳；runtime_page.py填入各稿document-state，runtime_contract.py逐页验证静态对象。_runtime/free-pages为用户持久自由草稿，不是临时缓存，不得自动清理；在目录中标为自由草稿，不自动迁入成品目录。_runtime/runtime-fonts是本机字体缓存，字体二进制不进公开仓；字荐仍是可选来源。旧照片卡片编辑器与保存协议保持兼容，不自动转换旧内容。

旧稿自由副本试用：/api/free-copy仅从已保存版本构造副本，不接收浏览器提交的HTML。render.cjs capture-layout在与PNG相同环境读取排版；每页独立html保存在cards中。当前仅07234e3e1ddeabab展示试用入口；不得据此自动转换其他正式稿。

视频发布板块：/video与/video/<id>只读扫描config.json的可选videoRoot（直接子目录、YYYYMMDD_开头），不修改视频与文案；成片候选优先成片/交付/renders/，其余取最新，跳过名含测试/预览/preview/temp的片段；时长分辨率用标准库解析mp4，不依赖ffprobe；媒体走Range（206）。状态唯一来源是项目根目录的.published/.parked/.abandoned标记，页面切换即写/删标记，未标记为待发布；只在本机打标记，不得自动上传或发布。文案以各项目发布文案.txt为唯一来源，页面可编辑保存标题、正文、标签，必须核对copyRevision，409保留输入；保留封面文案和其他段落，旧文本备份到_runtime/video-copy-recovery。examples/video-demo为虚构演示，演示截图放docs/screenshots，不得把用户真实视频或文案带进公开仓。视频板块与图文保存/导出协议相互独立。

列表隐藏：_runtime/catalog-metadata.json中articles/videos的trashedAt为唯一来源；隐藏/恢复只改变显示状态，不删除或移动作品文件；永久删除另走受确认的清理接口。公开仓不得包含这些用户管理数据。视频详情只展示视频预览与同源发布文案，不展示版本、参数、资料或门禁侧栏。

自由整体排版：web/runtime/layout-panel.js负责角色样式与只读排版检查。data-text-role/data-layout-follow及各页data-layout-theme/data-layout-accepted保存在cards.html；现有自由稿不自动猜角色。根文字样式与跟随基线不同视作局部覆盖，子元素内联覆盖默认保留；恢复跟随需明确清除对应属性。检查UI只放在作品根之外，不写入导出；不以移动/缩字隐藏越界，重叠为提示。

来源类别恢复：role_recovery.py只从已核验SHA256的source-index.html和conversion记录取证，按明确字段/原页/稳定编号唯一匹配；重复、无来源改字、新对象不得猜。来源和人工角色保存在data-source-origin/data-role-origin，人工修改优先；撤销后标记source-opt-out，只有主动重试才恢复。恢复接口遵守revision/锁、留恢复点并验证artwork_fingerprint不变；不能以恢复类别顺带改字、调色、改尺寸或导出用户PNG。

就地编辑：点击图卡同步当前页；添加对象通过 editor.addObjectAt 指定图卡及可选落点，原生新文字默认正文。对象工具栏跟随选择，单页背景入口在页码旁；整体面板仅展示未确定的类别确认，不把来源恢复/逐对象标注作为正常使用前置。

对象操作不再有独立工具栏/对齐面板；保留对象自身拖动吸附、缩放、旋转、删除，以及边缘填色/边框/图片替换。object-inline-controls 必须从序列化及PNG排除。添加只从每页入口选择文字/图片，不出现选页或位置表单，顶部无添加按钮。

永久清理：仅已隐藏内容可经 content-delete-preview / content-delete 删除；预览绑定kind、ID、绝对目录和文件清单签名，执行需原token。只允许配置根/自由草稿根的直接作品子目录，拒绝链接与联接点、身份别名、活动导出、文件变化或恢复条目。实际删除整个作品目录，必须在UI列明路径/范围并显式确认，不得将隐藏当已删除。隔离虚构数据用于删除验证，禁止测试删除用户作品。

目录生命周期UI：正常和隐藏条目共用列表，当前筛选排序后隐藏项稳定沉底，不使用独立已隐藏页或顶部视图切换。睁眼表示正常、闭眼表示隐藏；删除只在隐藏项上显示。底部分隔区支持折叠和按需批量勾选，永久删除仅一次范围确认。图文/视频必须一致。

统一发布区：web/publish-ui.js / publish.css 是图文和视频共用的复制、标签、平台入口与发布卡片样式。视频详情只含发布视频（封面+视频）和发布内容，保存仅改标题/正文/标签且保留其他文案段落及revision冲突保护；媒体不改写，不自动上传发布。新增共享静态资源必须同步server白名单。

标签合同：发布区显示、保存与复制均为 #标签一 #标签二；单标签按钮显示并复制#标签。旧换行/逗号/已有井号输入兼容，失焦规范化；不得继续提示每行一个标签。由web/publish-ui.js统一格式，旧照片编辑器保持同语义。
