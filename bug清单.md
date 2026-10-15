# 代码审查问题清单

| # | 严重度 | 问题 | 位置 | 后果 |
|---|--------|------|------|------|
| 1 | 🔴 | 词缀"减少类"属性方向反了（`mul()` 把 `spreadRed/reloadRed/heatRed` 当加成算） | `domain/affixes.js` `computeGunMods` | 精准/迅装/稳固词缀实际是**负面**效果：枪更散、换弹更慢、热量更猛 |
| 2 | 🔴 | 关卡设计器存**左下角**坐标，游戏按**中心点**消费 | `designer/levelEditor.js` ↔ `world/level.js:applyCustomIfActive` | 自定义关卡所有地形错位（下偏 h/2、右偏 w/2） |
| 3 | 🔴 | `drawWorld()` 里敌人被绘制两遍 + 血条两遍 | `game.js:405-406` 和 `444-446` | 敌人盖在子弹/光束上，CPU 浪费一倍 |
| 4 | 🟠 | 盾牌碎后无法恢复（`setShield(true)` 不重置 `shieldHp`） | `entities/player.js` `setShield`/`damageShield` | 盾碎 = 该存档位永久废掉 |
| 5 | 🟠 | `armorDmgMul`（破甲）从未在结算敌人护甲时使用 | `systems/combat.js:136` 附近 | "破甲"词缀白给 |
| 6 | 🟠 | `defenseFlat`（铁壁）从未被 `syncArmorFromInventory` 读取 | `game.js:syncArmorFromInventory` | "铁壁"词缀白给 |
| 7 | 🟠 | 狙击 hitscan 走 `hurt()` 绕过护甲/部位倍率 | `systems/combat.js:applyHitscanDamage` | AWP 无视护甲；无爆头顿帧/爆浆；无击退踉跄 |
| 8 | 🟡 | 对中文 label 调 `.toUpperCase()`（空操作） | `systems/combat.js:357` | 无害但像残留代码 |
| 9 | 🟡 | `Player.stats()` 每帧造新对象 | `entities/player.js` `stats()` | 10 人战场无感，但可记忆化 |
| 10 | 🟡 | `hud.js` 每次刷新 10+ 次 `getElementById` | `systems/hud.js:updateStatusPanel`/`streakShow` | 轻微；缓存元素即可 |
| 11 | 🟡 | `cropCache` 删除素材时不同步清 | `designer/studio.js` | 工坊不常用，量级小 |
| 12 | 🟡 | AGENT.md 说"后坐力已整体移除"，但 `player.js:616` 仍在做水平推背 | `entities/player.js:616-617` ↔ `AGENT.md` | 文档与代码不一致，误导后续改动 |
| 13 | 🟡 | 菜单"装备整备"的 `setTimeout(bpToggle, 1050)` 未查菜单状态 | `ui/menu.js:start` | 玩家 1s 内手动关菜单会被意外开背包 |
| 14 | 🟡 | `isCustomActive()` 定义了但 `applyCustomIfActive()` 内联了同样判断 | `world/level.js` | 两处逻辑可能漂移 |
| 15 | 🟡 | `w2s`（camera.js）与 `w2sC`（game.js 内联）双份实现 | `systems/camera.js` ↔ `game.js:drawWorld` | 改偏移公式要改两处 |
| 16 | 🔴 | 敌人受击/击杀的顿帧把全世界 `timeScale` 压到 0.02,应该是只冻挨打的那一个 | `feel.js hitStop` ← `combat.js onEnemyDied`、`game.js 近战` | 打谁谁定格才对;现在开一枪全世界一起卡 |

---

## 修复记录（2026-10-15,全部 15 条已处理并验证）

| # | 处理 | 验证 |
|---|------|------|
| 1 | `computeGunMods` 的 `spreadRed/reloadRed/heatRed` 改走新增的 `red()` 乘区（`1 - 减少百分比`,下限 0.2 保底）,不再误用 `mul()` | node 直跑聚合函数:精准17→0.83、迅装20→0.8、稳固25→0.75、叠 200 保底 0.2 ✓ |
| 2 | 存档格式升级 **v2 = 中心点**（游戏约定）;编辑器内部仍用左下角,出入各转一次;`applyCustomIfActive` 读到 v1 旧档按绘制意图自动迁移 | v1 旧档(左下 10,2,4×2)重载后 32 块 tile 质心 (12,3)、跨 [10,14]×[2,4] ✓;设计器画块保存 → `{version:2, x:22,y:3}` ✓;游戏消费两块 4×2 各 32 tile 落点分毫不差 ✓ |
| 3 | 删掉 `drawWorld` 里第二遍敌人+血条绘制（保留第一处:敌人在子弹/光束下层） | 战斗截图:敌人/血条单份、渲染无异常、1212 FPS ✓ |
| 4 | `setShield(true)` 时 `shieldHp` 重置为 100 并落档（碎盾重新架起=修好） | 页面实测:打碎(shield false/hp 0)→重新架起→hp 100 ✓ |
| 5 | 弹丸出厂带 `armorMul`（`st.armorDmgMul`）,`Dummy.hit()` 护甲耐久按 `dmg×armorMul` 扣 | 实测同弹道 armorMul 2.0/1.0 掉甲比精确 2.0 ✓ |
| 6 | `syncArmorFromInventory` 聚合 `defenseFlat` → `player.armorDefensePct`;`defense` getter 改读它（视觉预设本来就没有 defense 字段） | 实测 `armorDefensePct=30 → defense 0.3`,归零 → 0 ✓ |
| 7 | `applyHitscanDamage(C, ev, maxT)` 重写:走 `zoneAt` 定部位 → 部位倍率(头2/身1/腿0.2) → `e.hit()`(护甲/破甲/击退/踉跄/打断) → 与弹丸共用的 `hitFeedback`(火花/血雾/飘字/碎甲/吸血);击杀进 died 事件 → 顿帧/爆浆/连杀全套 | 实测:部位倍率+护甲吸收+击退+闪白+飘字+粒子 ✓;999 伤击杀 → died(zone) → streak+4、trauma 0.45 ✓ |
| 8 | 去掉中文品质 label 上的 `.toUpperCase()` | 代码审查 ✓ |
| 9 | `stats()` 记忆化:以 `weapon + gunMods 对象身份` 为失效键（换枪/工坊重算 gunMods 自动失效） | 实测两次调用返回同一对象 ✓ |
| 10 | hud.js 面板与连杀公告 DOM 引用模块级缓存 | 截图确认面板数值正常刷新 ✓ |
| 11 | studio.js 删素材同步 `cropCache.delete(id)` | 代码审查 ✓ |
| 12 | AGENT.md 三处后坐力描述改为实情:竖直后坐已删,保留热量散布 + 水平轻推背 | 与 player.js 开火分支逐行核对 ✓ |
| 13 | 「装备整备」定时器句柄化:`menuShow()` 取消 + 触发前再校验 `!open && !helpIsOpen()` | 实测:点装备整备 → 1s 内回菜单 → 1.4s 后背包未弹、菜单保持 ✓ |
| 14 | `applyCustomIfActive` 改用 `isCustomActive()`,判断逻辑单点化 | 两轮关卡迁移测试均经过该路径 ✓ |
| 15 | camera.js 新增 `makeW2S(camO,W,H,PPM)` 工厂,主视图与狙击镜共用;`w2s` 变成它的 cam 绑定;game.js 删内联 `w2sC` | 主视图+狙击镜渲染截图正常 ✓ |

### #16 敌人顿帧改个体冻结(2026-10-15 补)

**处理**:新增 `Dummy.freezeHit(dur)`/`pinFrozen()` —— 冻结瞬间抓全身刚体位姿+速度快照,
game.js 在每次 `world.step` 后把冻结者的位姿回填(`pinFrozen`),期间 `Dummy.update` 短路
(AI/计时器/电机伺服全停)。物理照常步进,但它的姿态纹丝不动,到点释放、击退/死亡飞掷接着演。
接入点:击杀 `onEnemyDied(C, ev, e)` → `enemy.freezeHit(0.085 爆头 / 0.055)`;近战命中 → `0.025`。
全局 `hitStopT` 机制保留,只服务玩家侧事件(重着陆)。重生时清 `freezeT/frozen`(防旧快照变传送门)。

**验证**(逐帧 trace):死亡当帧 `freezeT=0.055` → 逐帧递减 0.038 → 0.022;**冻结期间其他敌人
照常巡逻**(x 65.9→65.8→65.7)、`timeScale` 恒 1、全局 `hitStopT` 恒 0;尸体位姿在冻结期间
精确到 1e-9 不动,越过 0.055s 后解冻、死亡飞掷继续。测试期间发现菜单暂停(0.3×)会让
`__frameN(1)` 不够步进、事件积压 —— 属既定子弹时间行为,非 bug。

验证环境备注:页面 0 报错(`__pageErrors`/`__lastFrameError` 全空);后台标签 rAF 冻结按坑 7 用 `__frameN` 推帧;
另给 game.js 加了调试句柄 `window.__combat`(命中管线直调,见 AGENT.md 调试入口)。
⚠️ 测试期间 `contra-level-custom`/`contra-level-active` 被测试数据覆盖后已清空 —— 之前画的关卡需要到设计器重画一版(存档格式已升级 v2,新画的会精确落点)。

---

## 第二轮审查问题清单与修复记录（2026-10-15,13 条 + 1 新功能,全部处理）

| # | 严重度 | 问题 | 位置 | 处理 |
|---|--------|------|------|------|
| N1 | 🔴 | 狙击开镜必抛 `ReferenceError`:`mouse` 在 game.js 用了但从未导入(input.js 模块级导出不是全局)——持 AWP 时每帧渲染中断,前景/遮罩/红晕全丢 | `game.js` render() | 补 `import { mouse }`;浏览器实测持 AWP 推帧 `__lastFrameError` 全空 ✓ |
| N2 | 🔴 | 敌人抽到 AWP = 哑火(敌人事件循环不处理 `hitscanShot`,无伤害无音效)+ 狙击站桩让它永久定在原地 | `enemies.js`/`game.js` | 敌人枪池排除 hitscan(mode 过滤),顺带清掉敌人继承玩家槽位词缀 ✓ |
| N3 | 🟠 | 死亡重生不调 `syncArmorFromInventory` → 装备词缀(HP上限/防御/吸血/掉率/金币/近战/回春)全部静默失效,直到下次背包穿戴操作 | `game.js resetPlayer` | 复位后立即重绑 ✓ |
| N4 | 🟠 | 开背包按 Esc 双触发:bpWire 的 Esc 监听先关背包,input.js 随后看到"背包已关"把同一次 Esc 当暂停键弹主菜单 | `backpack.js bpWire` | Esc 分支 `stopImmediatePropagation()` ✓ |
| N5 | 🟠 | drawWorld 掉落物整块误用主画布 `ctx`(应为参数 `c`)——狙击镜里看不到掉落物,主画布被画上错位鬼影 | `game.js drawWorld` | `ctx`→`c`(13 处) ✓ |
| N6 | 🟠 | 词缀聚合漏接 4 类:汲血(meleeLifesteal)、复仇(lowHpDmgPct)、强击枪侧(meleeDmgPct)、猎手/贪婪枪侧(dropRate/coinGain)——掷出来全白给 | `affixes.js` 聚合 + player getter + game.js 消费 | computeGunMods/computeArmorMods 补键;Player 新增 meleeDmgMul/coinGainPct/dropRatePct/lowHpDmgPct getter(枪+防具合并);复仇按 hp<35% 生效于弹丸/hitscan/近战 ✓ |
| N7 | 🟠 | 枪械词缀生命周期混乱:轮盘切枪 gunMods 不重算(旧枪词缀跨枪继承)+ 死亡重生随机重掷并覆盖枪存档 | `player.js build`/`wheel.js`/`game.js storage` | 词缀改存独立键 `contra-gun-affixes`(跟槽位走),切枪/换枪/重生都不重掷;wheel 切枪带到新枪重新聚合 ✓ |
| N8 | 🟡 | 三合一产物无词缀(手工构造漏了 affixes,合成永远出白板) | `inventory.js invCombine` | 按新品质 `rollAffixes` 重掷 ✓ |
| N9 | 🟡 | 波次横幅/金币+1/拾获/背包已满 飘字缺 `age` 字段 → NaN,果冻弹出动画失效 | `combat.js`×3/`game.js`×2 | 统一补 `age: 0` ✓ |
| N10 | 🟡 | fx 计时器(火舌/红闪/白闪)衰减走世界时间,与注释/文档声明的真实时间不符(慢动作里拉长 ~12×) | `game.js` | decayTimers 从 step() 挪到 frame()(真实 dt) ✓ |
| N11 | 🟡 | 生产构建漏配 level-editor/fonts 两页(菜单"关卡设计器"部署后 404);菜单/帮助链接的 `index.html`(陈列馆)项目里不存在 | `vite.config.js`/`game.html` | input 补两页;删除陈列馆死链 ✓ |
| N12 | 🟡 | 漂移小项:包名仍为 travel-gallery;`three` 依赖零引用;README 结构章节路径全部过期、轮盘"6份"实为 7 项;game.js QUALITY 重复导入;rollAffix 死代码 + rollAffixes 内死函数 pick();game.html 双份错误收集脚本;HUD 刷新 `fpsN & 5` 位与误用 | 各处 | 全部清理 ✓ |
| N13 | 🟡 | 自定义关卡"防陈旧 flag"守卫因 import 顺序失效(level.js 先消费、menu.js 后纠正);关卡设计器「试玩」绕过场景选择也被守卫拦 | `level.js isCustomActive`/`levelEditor.js` | 守卫挪进 isCustomActive(以 `contra-scene` 为事实来源);「试玩」同时写 scene 键 ✓ |

### 新功能:方向性镜头后坐(模拟枪的重量感)

业界通行做法(DOOM/EFT 式 camera kick):开枪瞬间镜头沿**弹道反方向**被顶一下(枪把持枪者往后推),
再快速回弹。`camera.js camKick(dirX, dirY, power, heaviness)` → `cam.kx/ky`,叠加进 oX/oY
(trauma 噪声震动照旧),狙击镜内视图吃一半。**与准星/弹道完全解耦**(aimWorld 不含这些偏移)。

**调参迭代记录**:初版 (7+11×recoil)/钳制 ±30px/恢复 8.7~15/s —— 用户实测判"手感 debuff"后重调。
调研结论(Vlambeer《The Art of Screenshake》"宁少勿多";Source 引擎 viewpunch 影响瞄准是最有争议的模式;
a327ex 弹簧式方向冲量小幅快回):镜头平移 = 世界在固定准星下晃动,幅值大了或回弹慢了都会变成跟玩家抢准星。
现行参数:力度 = (1.6+3.2×recoil)×熟练度因子(狙 ×1.25),钳制 ±10px;恢复速率 = 40−min(21, recoil×8)。
自动武器(MP5/AK/M4/手枪)2~5px 小拳、连发间隔内(73~214ms)回弹 >90%,连发不积累漂移;
重枪(霰弹 9.3px / AWP ~10px 钳制)约 19/s 回弹,重量读得出来但 ~120ms 内归位。