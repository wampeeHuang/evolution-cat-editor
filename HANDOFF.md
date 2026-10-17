# 多篇编辑器交接 · v1.2.0 · 2026-10-14

## 已完成

通用实现迁至D:/tools/evolution-cat-editor；tool= evolution-cat-editor，创作分类，8797、autoStart=false。工具架projectPath/start/stop/url已改为工具目录与首页。停止/启动回验，最后服务PID11920由工具架启动。

首页自动发现D:/workspace/_output/evolution-cat/图文直接子目录中schema=evolution-cat-photo-v2的index.html。当前正式目录仅有素材管理一篇兼容编辑稿，ID978f4c524447c2a8；不把未兼容旧文案当新编辑格式。第二篇只要有兼容稿和本期素材即可自动出现，无登记数据库或独立端口。

保存POST articleId+revision，按篇锁与HTML SHA256检查，409保留当前编辑并提供下载，不强行重试。浏览器草稿按不同URL隔离。PNG POST返回jobId，由单worker队列执行；不可变快照/任务状态JSON，完成输出本篇并更新正式镜像；期间原稿改动则阻止旧快照覆盖本篇。禁止指向另篇输出路径。

## 验证证据

_runtime/fixtures A(2张)/B(3张)通过真实浏览器不同标题保存；第三个A标签因版本过期提示冲突且输入保留，磁盘A未被旧标签覆盖。两个导出同时提交，B显示前方1项；任务记录A结束早于B开始。A2/B3实际PNG1080×1440。跨篇输出请求400拒绝。正式素材管理稿新路由保存、8PNG导出成功。verify.py PASS。截图_runtime/冲突提示.png和多篇服务正式入口.png。测试稿不在内容目录/首页。

## 迁移与唯一来源

原期次_runtime/editor-service仅保留兼容跳转脚本，完整原服务恢复副本在本工具_runtime/migration-v1.1。原assets/editor是离线阅读快照，不再维护在线代码。通用更新日志在工具，不再记录到本期内容日志。既有v1/v1.1技能冻结包保留历史，新技能入口引用工具，禁止继续每篇复制一套服务。HTA旧兼容未改/未验；独立发布面板HTML从服务导出生成同源跳转入口。

## 约束

仅兼容现有照片卡片schema，尚未支持其他版式模型。单进程服务；跨多个独立服务进程的文件锁不支持，不启动第二个端口。任务队列不自动恢复执行，重启提示失败。所有字体字形覆盖、跨机部署未验。若更改卡片数，旧目录多余PNG不会自动删除，需人工核对上传编号；当前2/3/8验证无需删除用户素材。

工具位于既有D:/tools Git仓，窄范围提交；技能入口修改可在既有技能仓窄范围提交，不推送。

追加验证：A导出running时，B保存31ms完成；B旧快照输出标failed，未覆盖既有PNG。测试脚本_runtime/check_save_during_export.py。footer改为本期模型可选字段，默认进化猫，不在通用代码写死素材管理主题。

1.2.1新增SVG favicon；工具架卡片使用同图标，目录与篇目页均注入/icon.svg。SVG端点浏览器实际打开成功。

## 1.2.2 · 2026-10-17 返回顶部

共享editor.js/editor.css增加右下角48px圆形箭头按钮；页面滚动320px后显示，点击关闭浮层、清除提示、页码回P1并即时回scrollY=0，顶部隐藏。export模式不创建，打印隐藏；不改内容模型与保存协议。VERSION/CHANGELOG同步。

实际浏览器验证开发篇：发布面板滚动后可见，点击后scrollY=0、hidden=true、P1/7。截图_runtime/back-to-top-visible.png。node --check与窄范围git diff --check通过。恢复点_runtime/before-back-to-top-*。本次未重跑历史保存冲突/并发导出套件，未改相关逻辑。

## 1.2.3 · 统一字号与默认排版

默认主题为文渊宋体88、霞鹜文楷33、注释沿用设计27，品牌墨色加粗。两篇画布推荐同步该主题。封面标题使用与其他页相同字号，覆盖历史封面!important固定尺寸。其他已保存主题不自动迁移。

## 1.2.4 · 2026-10-17

发布图片区新增“打开文件夹”，通过同源POST打开当前篇01_图卡/cards。服务器按articleId推导固定目录，不接收任意路径；目录缺失显示错误，保留复制路径入口。仅本机Windows服务支持。
