# 进化猫图文编辑器

通用工具代码权威源在本目录，用户授权从内容期次迁移。内容根来自config.json，仅发现其直接子目录中schema=evolution-cat-photo-v2的index.html。不改其他应用、字体提供方或未兼容旧内容。

保存以articleId+HTML哈希检查，409不得静默重试或覆盖。草稿按独立URL隔离。每篇锁保护保存/正式输出，单worker导出队列保留不可变快照；新稿保存须阻止旧快照覆盖根目录发布图。

web/为通用编辑组件，server.py/render.cjs为服务/PNG渲染。_runtime仅工具自有任务/隔离测试，不能复制用户私有素材进Git。新期仍保留本地资产用于file浏览，在线组件由工具统一提供。更新VERSION/CHANGELOG和HANDOFF。验证两篇独立保存、同篇冲突、并发导出、路径隔离、实际PNG；不以状态标签证明成功。仅监听127.0.0.1:8797，工具架按需启停不自动启动。迁移与调试不得覆盖用户未保存内容。

局部授权例外：D:/tools/CLAUDE.md原仅准入第三方克隆工具；用户本轮明确要求自建通用服务迁入本目录，按该明确授权执行，不扩大到其他自建项目。用户已授权工具独立建仓：Git根为D:/tools/evolution-cat-editor，远端wampeeHuang/evolution-cat-editor，main分支；后续仅在本工具仓提交，不能在D:/tools总仓提交本工具变更。_runtime测试/用户素材不进Git。

首页分类与最近打开时间的唯一来源为_runtime/catalog-metadata.json，属持久用户管理数据，不作为可清理缓存；图卡内容仍以各篇document-state为准。创建时间显示目录创建时间，不倒填历史打开记录。


自由图卡：web/runtime/editor.html为第三方MIT运行时的共享宿主壳；runtime_page.py填入各稿document-state，runtime_contract.py逐页验证静态对象。_runtime/free-pages为用户持久自由草稿，不是临时缓存，不得自动清理；在目录中标为自由草稿，不自动迁入成品目录。_runtime/runtime-fonts是本机字体缓存，字体二进制不进公开仓；字荐仍是可选来源。旧照片卡片编辑器与保存协议保持兼容，不自动转换旧内容。

旧稿自由副本试用：/api/free-copy仅从已保存版本构造副本，不接收浏览器提交的HTML。render.cjs capture-layout在与PNG相同环境读取排版；每页独立html保存在cards中。当前仅07234e3e1ddeabab展示试用入口；不得据此自动转换其他正式稿。
