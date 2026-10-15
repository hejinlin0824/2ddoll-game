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

验证环境备注:页面 0 报错(`__pageErrors`/`__lastFrameError` 全空);后台标签 rAF 冻结按坑 7 用 `__frameN` 推帧;
另给 game.js 加了调试句柄 `window.__combat`(命中管线直调,见 AGENT.md 调试入口)。
⚠️ 测试期间 `contra-level-custom`/`contra-level-active` 被测试数据覆盖后已清空 —— 之前画的关卡需要到设计器重画一版(存档格式已升级 v2,新画的会精确落点)。