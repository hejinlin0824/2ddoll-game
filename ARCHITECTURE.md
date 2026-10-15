# 架构说明(Architecture)

> 分层的目的:**依赖方向单一** —— 上层知道下层,下层不知道上层。
> 改 gameplay 去 systems/,改数值去 domain/,加实体去 entities/,动不了 core/。
>
> 决策记录:评估过全量 ECS(bitECS/Becsy),**不采用** —— 本作实体量级 ≤10+1、
> 行为组合靠词缀系统(纯数据层)与 Dummy/Player 共骨架解决,ECS 的收益点
> (千级实体、缓存局部性、组合爆炸)都不占,而重写会冻结玩法迭代。
> 采用的是 ECS 的精神:数据与行为分离(domain 纯数据层)、系统化流水线(systems/)、
> 装配根(game.js)。未来实体类型爆炸时再评估。

## 分层与依赖方向

```
game.html ──▶ game.js(装配根:组装世界/系统/循环,~780行)
                │
  ┌─────────────┼──────────────────────────────────┐
  │ core/       常量与循环基座(config.js)           │  不依赖任何上层
  │ domain/     纯数据+纯函数+经济:                  │  只依赖 core
  │             gunPresets(武器词条/品质/预设)        │
  │             affixes(词缀池/掷取/聚合,DDD)        │
  │             inventory(背包实例/金币/强化/开箱)    │
  │             waves(波次导演)                      │
  │ world/      level(地形/背景绘制/碰撞分类)        │  只依赖 core
  │ entities/   player(布娃娃主角) enemies(Dummy)   │  依赖 domain/world
  │ systems/    音频/输入/相机/手感/特效/战斗/HUD     │  依赖 core/domain/world/entities
  │ ui/         wheel 轮盘 / backpack 背包 / menu 菜单│  依赖 domain(+main 注入回调)
  └──────────────────────────────────────────────────┘
```

- **装配根 game.js**:创建 world/player/wheel/waves,组装依赖包 `C`
  (系统模块通过 `C.player`(getter)/`C.enemies` 访问世界,防 resetPlayer 换实例失效),
  持有 step()(物理步编排:player.update → 玩家事件 → stepBullets/stepFx/stepPickups →
  waves/enemies → decayTimers → world.step)与 frame()(真实时间编排:tickFeel →
  timeScale 合成 → 累积器 → 相机 → render → HUD 文本),以及调试句柄
  (`__game/__feel/__actx/__frame/__frameN`)。
- **渲染(drawWorld/render)目前在 game.js**:它是渲染编排(消费所有系统状态)。
  若未来渲染复杂度爆炸(光照/图层)再抽 systems/render.js —— 不为拆而拆。

## 各系统一句话职责

| 模块 | 职责 |
|---|---|
| systems/audio | WebAudio 主链(master→低通闷化)、beep/gunSynth/noiseBurst 合成 |
| systems/input | 键鼠状态、坐标换算、监听安装(hooks 回调解耦业务) |
| systems/camera | 跟随/开镜变焦/NaN 防线、trauma²×平滑噪声震动(cam.oX/oY/oR) |
| systems/feel | 手感状态机:顿帧/击杀慢放/trauma/低血量心跳/连杀窗口(全真实时间) |
| systems/fx | 粒子/碎片/痕迹 decals/飘字/光束 + 火舌与白闪计时器 |
| systems/combat | 弹丸生命周期(变速/碰撞/部位倍率/护甲吸收)/hitscan/击杀结算/拾取 |
| systems/hud | 角色面板/连杀滚轮公告/拾取 toast(纯 DOM) |
| domain/affixes | 词缀=纯数据;属性=基础×聚合纯函数(加词条零改动消费端) |

## 地形破坏(tile 化)

- buildLevel 时可破坏 rect 细分为 0.5m tile(每个 tile = 小 rect + 独立静态刚体,
  HP = 面积×40 ≈ 10),tile 就存进 LEVEL.rects —— groundYAt/命中/渲染等所有遍历零改动。
- 子弹命中 tile 扣血,归零碎裂(destroyRect:splice + destroyBody);**溢出伤害沿弹道
  继续啃相邻 tile**(damageTerrain 递归,深度≤3)—— 步枪一发打穿 2 块 + 第三块裂纹。
- 主地表 destructible:false,不 tile 化、不可破坏(防掉深渊)。
- 方案属业界"块删除"流派(Worms 位图挖洞/QuadTree 雕刻不适用 planck 刚体)。

## 已知约定(改代码前必读)

1. 真实时间 vs 世界时间:feel/fx 计时器走真实 dt(game.js frame);step() 里的
   dt 是固定物理步长(受 timeScale 缩放)。两者别混。
2. UI 层(wheel/backpack/menu)不 import 实体;需要游戏状态时由 game.js 注入回调
   (bpSetGunInfo/bpSetWorldDrop/menuInit({beep,...}))。
3. 系统 → 系统的依赖也走显式 import(audio/feel/hud 可互相,但禁止回到 game.js)。
4. 敌人=AI 驱动的 Player 实例:改主角手感=自动改敌人(enemies.js 只做 AI 壳)。
5. 词条/装备的持久化键都在 domain/* 内部,别在系统层直接读 localStorage。
