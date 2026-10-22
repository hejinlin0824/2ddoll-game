# AGENT.md — AI 接手须知

> 本文档写给接手本项目的 AI 助手(也供人类参考)。读完这页,你应该知道我们在做什么、
> 为什么这么设计、哪些坑已经踩过、以及下一步该干什么。**改动前请先读完,别重复踩坑。**

## 项目是什么

**HERO(原名 2Doll Game / 魂斗罗·布娃娃)**:一个 2D 魂斗罗风格的射击游戏,主角是
**主动式布娃娃(active ragdoll)**——planck.js 物理驱动的关节小人,不是帧动画。
外加一个配套的**武器与装备设计器**(用户拼枪、标握点、定制头盔/防弹衣,游戏内实时生效)。

当前状态:主角完成且手感验证过(走/跳/趴/双武器/鼠标瞄准/镜像/布娃娃测试),
**波次生存玩法已上线**:敌人右缘按波刷新(15 波,无甲→全金装),真实伤害 + 部位倍率 + 小血条 + 受击闪白 + 金币/装备掉落(品质光柱)。
**空中部队已上线**:第 4 波起每 4 波(+终波)一架武装直升机母体机(骨骼关节机体,机炮+火箭+持续放无人机),无人机接近→俯冲自爆,一发即碎。

## 技术栈与运行

- Vite 6 多页应用,原生 ES 模块,**无框架**;渲染全部手写 Canvas 2D。
- 物理引擎:planck.js 1.5.1(Box2D 纯 JS 移植),y 轴向上,重力 (0, -30)。
- `npm install` → `npm run dev` → http://127.0.0.1:5199/game.html(port 5199,strictPort)。
- `npm run build` 需要 vite.config 里 `build.target: 'es2022'`。
- ⚠️ 本机器全局 npm/git 代理指向 127.0.0.1:7890(Clash),**push/拉取 GitHub 前先开代理**;
  项目 `.npmrc` 已置空 npm 代理并指向 npmmirror,别删。

## 页面与目录

- game.html(游戏)/ weapon-editor.html(枪械设计器)/ level-editor.html(关卡设计器)/
  skin-studio.html(皮肤工坊)/ asset-studio.html(装备工坊,暂缓)/ fonts.html(字体审批)
- src/game/
  - game.js          装配根:world/player/waves 组装、依赖包 C、step/frame 编排、调试句柄、渲染
  - core/config.js   分辨率与物理常量
  - domain/          纯数据+纯函数:gunPresets / affixes(词缀) / inventory(经济) / waves(波次)
  - entities/        player(布娃娃主角) / enemies(Dummy=AI 驱动的 Player) / airunit(Gunship 母体机 + Drone 无人机)
  - systems/         audio / input / camera / feel(手感状态机) / fx / combat / hud
  - ui/              wheel(轮盘) / backpack(背包) / menu(主菜单)
  - world/level.js   地形数据与绘制
- src/designer/      editor.js / studio.js(设计器页面专用)
- 依赖方向与各模块职责详见 ARCHITECTURE.md

## UI 设计系统 v2(2026-10-17 · 战术指挥风)

**全部 UI 样式集中在 game.html 的 <style> 里**(menu.js/backpack.js/corpse.js 只注入结构与
class,不写样式);设计令牌在 `:root`:--bg-0 #070b13 深钢蓝底 / --amber #ffb14a 琥珀主色 /
--steel #7fb2ff / --line rgba(148,178,214,.2) 冷钢描线;显示字体 ZCOOL QingKe HuangYou,
正文 Noto Sans SC。**语言:直角面板(2px 圆角)+ 战术角标(.tac 类,面板四角琥珀 L 亮线)+
大字距 + 左侧品质色条**,不用大圆角和 emoji 图标(菜单链接的 🎨🗺🧍 已换成 ▸ 前缀纯文字)。

- **文案纪律:面向玩家的文案不出现"布娃娃"**——状态叫"失控"、提示叫"失控倒地 · 按 E 起身"、
  标题是 "HERO — 突击行动"、副标 "TACTICAL STRIKE · 突击行动"。设计器入口更名:
  枪械设计器→军械工坊 / 关卡设计器→战场编辑器 / 皮肤工坊→干员外观(链接 href 不变)。
- 主菜单(2026-10-17 v3.1:**黄金比例斜切门**):双门用 clip-path 斜切 —— 左门 polygon(0 0,
  62% 0, 53% 100%, 0 100%),右门补齐(≈61.8% 黄金比例,斜差 9%);#menuSeam = **斜切边光影条**
  (left calc(53%-17px) + rotate(9.1°) + 双渐变:琥珀亮线在切边、深影晕向右侧 = 立体感),
  菜单常开时常亮。**⚠️ 斜切安全区:左舷内容必须住在 .menu-col(width min(600px, 45vw))里**
  —— 斜线在底部只到 53vw,内容超宽会被 clip-path 裁掉(按钮被切,用户实测毙过)。
  **开门动画 = 先 morph 后开门**:点进入战场 → #menu.opening 使 clip-path 过渡回竖直
  (0.24s,门板不动)→ 原版三段式竖缝辉光动画(#menuGlow,menu.js t0 延后 T_M=0.22s);
  合门结束后移除 .opening morph 回斜切。斜切门直接横移会错乱,别省掉 morph。
  场景选择 = 2×2 任务卡网格(大编号水印 sc-num、锁定斜纹遮罩、选中琥珀左条)。
  HUD 资源条 = 斜切段状(brow 行:左 btag 标签 + 斜角 bar + 右 bval 读数,
  ::after repeating-linear-gradient 做分段刻度)。
- **场景主题系统(level.js)**:THEMES 调色板(天空渐变 + 素材层 canvas 滤镜染色,离屏缓存
  tintCache)+ 氛围压暗色。**素材也是每关一套(BG_SETS)**:wild/roof 用 ansimuz 山峦(层高
  160px,scale 4.5)/ room 用 craftpix 都市暮色 576×324(scale 2.22)/ desert+ tropic 用
  Multilayer 山峦 640×360(scale 2.0),全部在 public/bg/<scene>/,来源与许可见 public/bg/CREDITS.md。
  每关地形布局 LAYOUTS[scene](主地表共享,其余结构各异);场景切换 = 存档 + 重载
  (刚体按布局在创建时生成)。
- **每关玩法规则(waves.js SCENE_RULES)**:gunshipEvery(母体机节奏)/ batch(每架投兵数)/
  qualityRush(品质提速波数,港区精锐提前)/ cap+swarm(沙丘人海,出怪上限 13)。
  五关:野外标准(4 波/机 4 人)/ 屋顶制空(3 波/机 3 人)/ 港区巷战(6 波/机 2 人,精锐+2 波)/
  沙丘人海(4 波/机 4 人,上限 13)/ 海岛跳跃(5 波/机 5 人,上限 9)。
- **开场守军按关卡布防(game.js GARRISONS)**:哨兵/巡逻/掩体位各不相同,守军不清完不开波。
- **运输机绳索投兵(airunit.js TransportHeli)**:波次小兵不再凭空刷 —— 运输机(纯脚本实体,
  无刚体、不可攻击)从右缘飞入 → 悬停 → 每 0.5s 放一个士兵沿绳滑降(Dummy roped:钉绳匀速
  下滑 + 双手举头抓绳姿态 player.roping,接地转正常 AI)→ 卸完离场;waves.js 一架一批(≤4 人),
  运输机 alive 期间阻塞清波判定。
- **关卡布局 + 开场守军**:level.rects 新增左区制空台 / 中区双掩体 / 右区两级断崖(投放场
  前的天然工事);game.js 开场布 4 人守军(高台哨兵/平台巡逻/台阶/掩体,respawn:false),
  **守军不清完波次不启动**(waves 的 aliveN 条件天然实现)。
- 右舷 = 场景名 + **战术情报面板**(.menu-intel:敌军攻势/制空威胁/撤离条件/战利品,是真实
  配置)+ 版本号。
- **改样式别动 DOM 钩子**:JS 依赖的 id/class 清单见过一遍(menu-left/right、menuSeam、
  menuScenes、scene-card.sel/.locked、pnl*、streak*、loot-card、bp-tabs button.on、
  eq-slot.drop-hot、ic-card.dragging、cp-*、help.show、box-lid.crack/.fly、prize.pop 等)。
  换皮时保持这些名字,JS 零改动。

## 游戏架构(改代码前必读)

### 主动式布娃娃
- **躯干是唯一主碰撞体**:一个"盒+上下圆"拼成的竖胶囊,包络全身(脚底 -0.78 到头顶
  +0.78,单位米)。它直接做平台跳跃式速度控制;**不要给四肢加碰撞**(脚部碰撞圆方案
  试过,跑步会被自己的脚绊倒)。
- 头 + 双臂(各两段)+ 双腿(各两段)共 9 个肢体 = 带限位的 RevoluteJoint 挂在躯干上,
  每帧用关节电机做 PD 伺服追踪"姿态目标角"。跑步是 sin 相位循环,跳/落/趴是静态姿态组。
- **双臂 IK**:瞄准手(armLF,近臂)弯肘握 grips.rear(枪把),副手(armLB)握
  grips.front(前握点)。锚点距离按"双手都够得到"反算——把枪往怀里拉,不是伸直手臂去够。
- **鼠标瞄准**:枪的世界角 = 光标方向(与手臂无关,手臂只是视觉追随),子弹从
  grips.muzzle 出膛、直射光标点——弹道必然穿准星。
- 布娃娃测试:R 关电机瘫倒,E 复位。B 物理线框。

### 熟练度(竖直后坐已移除;保留热量 + 轻推背 + 方向性镜头后坐)
- `player.skill` 0.1~1(localStorage `contra-skill`),每枪 +0.006。
- `player.heat` 热量只影响散布:散布 = (0.012+0.075·heat)·(1.35-0.75·skill);
  每发 += 0.26·recoil词条·熟练度因子·heatMul(稳固词条降),停火按 (0.35+0.4·skill)/s 冷却。
- 弹道永远精确指向光标(无上抬/无震颤/无弹道偏移)——别把竖直后坐力加回来。
- 保留**每发水平轻推背**:扣扳机时 -facing·kick 冲量(kick = 0.7~1.15 × recoil词条 × 熟练度因子,
  player.js 开火分支),纯体感不影响弹道;删它之前先问用户。
- **方向性镜头后坐(cam kick,模拟枪的重量感)**:开枪瞬间镜头沿**弹道反方向**被顶一下再快速回弹
  (camera.js `camKick` → cam.kx/ky,叠加进 oX/oY;狙击镜内减半)。**与准星/弹道完全解耦**
  (aimWorld 不吃这些偏移,弹道永远指光标)。
  调参红线(Vlambeer/Source viewpunch 的教训):镜头平移 = 世界在固定准星下晃动,
  **幅值大/回弹慢都会变成"跟玩家抢准星"的手感 debuff**(初版 30px/8.7/s 被毙)。
  现行:力度 = (1.6+3.2×recoil词条)×熟练度因子(狙 ×1.25),钳制 ±10px;
  恢复速率 = 40−min(21, recoil×8) —— 自动武器 2~5px 且连发间隔内回弹 >90%(不积累漂移),
  AWP/霰弹 9~12px 稍慢回(~19/s)读重量。与 trauma 噪声震动是两套:camKick 有方向、trauma 是 trauma² 噪声。
  要改成"顺着枪口方向踢"翻 camKick 里两个符号即可。

### 武器/装备轮盘(子弹时间)
- 按住 Tab 唤起 wheel.js;世界时间走 main.js 的 timeScale(轮盘开 = 0.08,指数平滑过渡),
  只乘在主循环 `acc += dt * timeScale` 上——物理/子弹/粒子全员慢动作;
  轮盘动画走真实 dt(「菜单拥有自己的时钟」),所以 UI 跟手而世界慢放。
- 选择是**扇区制**:鼠标相对轮盘中心(640,360)的方位角定高亮,中心 36px 死区;
  光标隐藏(canvas cursor:none),方向即选择。武器层 = 整圆 6 份(5 枪 + 常备手枪);
  装备层(T 切换)= 上下半圆各 5 份(上 = 头盔,下 = 防弹衣,各含「脱下」项)。
- 「当前」= 正在使用的枪(weapon+gunDef.name 匹配)或穿戴中的装备(loadout.x.name)。
  悬停当前项 = **卸下**(枪:holster 切手枪;装备:写空 parts 的显式未穿戴,**别删键**,
  删键会回退出厂默认);悬停其他 = **选中**。松开 Tab 应用高亮项,左键立即应用并收起,
  全部实时生效并落盘 localStorage(与设计器共用同一批键,跨标签页 storage 事件同步)。
- 坑:Tab 必须 preventDefault(否则浏览器焦点切走);blur 必须 wheel.forceClose()
  (否则子弹时间卡死);轮盘打开时 step() 强制 input.fire=false(左键留给确认,
  空格也不许开火);wheel 持有 player 必须用取值函数(resetPlayer 整体重建 player,
  存直接引用会拿到已销毁的旧实体)。

### 武器与装备(全部 localStorage 持久化,设计器保存后 storage 事件跨标签页实时生效)
| 键 | 内容 |
|---|---|
| `contra-gun-primary` | 主武器(设计器数据:parts + grips.front/rear + muzzle,200px=1m) |
| `contra-gun-affixes` | **主武器槽位词缀**(跟槽位走:轮盘换枪/重画/死亡重生都不重掷,wheel 切枪时带到新枪) |
| `contra-equip-head` / `contra-equip-torso` | 头盔/防弹衣(parts + defense) |
| `contra-skill` | 熟练度 |
| `contra-shield` / `contra-shield-hp` | 盾牌是否装备 / 耐久 |
| `contra-inv` | 背包(金币+装备实例,inventory.js) |
| `contra-skin` | **自绘皮肤六件套**(皮肤工坊产物,skin.js;头/躯干/大臂/小臂/大腿/小腿) |
| `contra-scene` | 选中的场景('wild'/'custom';level.js 的自定义关卡守卫拿它当事实来源) |

- 主武器:双手 IK 持枪,8.5 发/秒,弹 6→34 m/s,镜头微震;副武器手枪:单手 0.22m、4 发/秒。
- 装备 = 纸娃娃挂点:头盔画在头部局部空间、防弹衣画在躯干局部空间(纯渲染+defense 数值,
  不动物理);`player.defense` 汇总显示 HUD,**未来敌人伤害系统把它用作对应部位减伤系数**。
- 出厂默认穿戴:localStorage 没有对应键时 `loadEquip()` 回退 `DEFAULT_EQUIP`(军用钢盔+
  轻型背心);编辑器「脱下」写入**空 parts** 表示明确脱下(loadEquip 返回 null)。
  "从没存过" ≠ "脱下",别混。装备部件必须**左右对称**(头部/躯干局部空间不随朝向镜像,
  有方向性的零件——比如棒球帽帽檐——会被毙)。
- 游戏内枪械/装备渲染统一加深色描边(线宽 1.5/k 固定屏幕像素);预设配色一律亮/中亮,
  深色件必须配亮色高光件,否则夜色背景看不清(毙过两次)。

### 武器词条(stats)
- 每把枪在 gunPresets.js 的 WEAPON_STATS 里挂 stats:射速 rpm/威力 damage/弹匣 mag+reload/
  散布系数 spread/弹丸数 pellets+pelletSpread(霰弹)/初速 muzzleVel/射程 range(推导弹丸寿命)/
  后坐力 recoil/模式 mode('auto' 弹丸 | 'hitscan' 瞬时射线)/枪声合成参数 sfx。
- PISTOL_STATS = 手枪词条;DEFAULT_STATS = 自定义枪兜底;loadSavedGun 按名字回填缺失词条。
- 未来刷宝词缀就在 stats 上叠(前后缀),轮盘武器格副标题直接展示 伤害/射速。
- 玩家 fireCd = 60/rpm;打空自动换弹(reloadT);霰弹枪一次 events 推 parts[N] 个弹丸。
- **真实伤害已接通**:弹丸 damage = 词条 damage(非归一),命中端 ×部位倍率;敌人子弹 ×0.35,玩家受击再 ×(1-防御)。
- 子弹曲线变速:初速 30% maxSp,随 age 二次曲线加速到满速(rampT = 0.6·寿命)——
  曳光随速度自动变长,越飞越快越有劲儿。别改回线性加速,会被毙。
- 竖直后坐力已按用户要求移除(无上抬/无震颤/无弹道偏移);保留热量散布与水平轻推背;别把竖直后坐加回来。

### 词条系统(affixes.js,DDD 领域层)
- **词缀 = 纯数据定义**(40 条:20 前缀 + 20 后缀),物品实例只存 affixes: [{id, v}] 引用;
  **最终属性 = 基础词条 × 词缀聚合**(affixes.js 的 computeGunMods / computeArmorMods 纯函数)。
  新增词条 = 在 AFFIXES 加一条数据,消费端零改动。
- 获取:rollAffixes(kind, quality) → 1 前缀 + 1 后缀(同属性键去重);品质档(broken/normal→1,
  fine/rare→2,epic/legendary→3)决定数值区间;future: true 的词条只展示不掷取。
- 属性键:dmgPct/rpmPct/magFlat/spreadRed/reloadRed/rangePct/armorDmgPct/heatRed/lifesteal/
  dropRate/coinGain/hpMaxFlat/moveSpeed/defenseFlat/meleeDmgPct/healOnKill/allDurPct/
  helmetDurPct/armorDurPct + future(burn/poison/slow/dodge/knockRes/eliteDrop/reflect/revive)。
- 消费端接线:**每个 stat 键都必须被 computeGunMods/computeArmorMods 聚合,漏聚合 = 词条白给**
  (曾发生:汲血/复仇/强击枪侧/贪婪枪侧全漏)。现行接线:player.stats() 吃枪词缀(伤害/射速/弹容/散布/换弹/
  射程/破甲);Player 的 getter 合并枪+防具两侧(meleeDmgMul/coinGainPct/dropRatePct/lowHpDmgPct);
  syncArmorFromInventory 绑防具侧(hpMax/移速/吸血/掉率/金币/近战/回春/汲血/铁壁);复仇在 game.js
  按 pstate.hp<35% 生效(弹丸/hitscan/近战);枪击吸血在 combat 命中结算;汲血在近战命中;回春在击杀。
- **主武器词缀跟槽位走**(`contra-gun-affixes`):build 首次掷一对并落档,轮盘切枪由 wheel 带到新枪
  重新聚合 —— 别把词缀写回枪数据(旧方案死亡重生会随机重掷,同一把枪死前死后词条不同)。
- **强化概率制**(inventory.js UPGRADE_RATE):普通→优良 99% / 优良→稀有 80% / 稀有→高级 70%
  / 高级→传说 8%;**失败吞金不退**(用户明确要求)。按钮显示成功率。
- 物品名格式:"A且B的xxx"(如"吸血且扩容的AK-47"),itemTitle() 生成,背包卡片展示词条行。
- ⚠️ **吞错误排查口诀**:功能"静默无效"先查 try/catch 是否吞了 ReferenceError
  (曾发生:rollAffixes 未导入,catch{} 吞掉 → 词条永远空)。
- ⚠️ **调试推帧必须传真实递增时间戳**:__frame(0) 的 dt 恒为 0 不会推进世界,
  用 __frameN(n)(内部递增 16.7ms),否则"世界冻结"是测试假象。

### 主菜单(menu.js + game.html #menu)
- **背景就是游戏本身**:菜单期间世界 0.3× 慢速待机演示(timeScale 合成最高优先级),
  敌人巡逻但 playerAlive 传 false(不警戒不射击),玩家输入锁死。`menuIsOpen()` 全局抑制。
- 布局 = 左右两扇毛玻璃门(各 50.6% 宽,⚠️ 必须 `box-sizing: border-box`,否则 padding
  撑宽两半互相叠盖);左门 = 标题/场景选择/按钮,右门 = 场景名简介。
- **开门动画必须 JS/rAF 驱动**(menu.js start/menuShow),这个 webview 里 CSS transition
  对 backdrop-filter 元素不生效(实测不动);CSS transition 属性必须删掉,否则和 JS 每帧
  赋值打架永远滞后。M 键回菜单 = 合门。
- **真空门三段式**(start() 内分段插值):A 0→0.34s 开缝 6%(easeOutSine+卡顿抖动,摩擦音)
  → B 0.34→0.5s 停顿蓄力(门缝光 .menu-seam 0.25→0.99,上扬音)→ C 0.5→0.86s easeInCubic
  哗然全开(onSlam 回调 = main 的 addTrauma+menuFlashT 白光 + noiseBurst 气流爆音)→ 落锁闷响。
  ⚠️ 暂停键唯一入口是 **menuToggle()**(menu.js):开着 → start() 开门,关着 → menuShow() 合门。
  直接调 menuShow() 在菜单开着时是无操作(曾让"再按继续"失灵)。
- 场景 = SCENES 数组(目前 1 可用 + 2 锁定占位);未来接 level.js 多关卡生成。
- **AI/警戒(调研后重做)**:交战粘性 —— `alert` 置位后只有玩家倒下才解除
  (距离条件会立刻覆盖远距离点名,曾是敌人永远跑不起来的 bug)。警觉来源:
  12m 视野 / 玩家枪声传唤 26m(狙击 40m)/ 死亡惨叫 11m 惊动队友(main 的 alertEnemiesNear)/
  挨打疼痛警觉。警戒后**冲锋**(vx=face×2.4,**不用 strafeFlip** —— 摇摆会让远程冲锋折返,
  卡墙靠跳跃脱困)直奔 12m 交战线,到线才点射。
- **受击反馈(确定性,不随机)**:poise 韧性条(POISE_MAX 8,肉击 ×1/爆头 ×2/甲击半,
  停火 3/s 恢复)满 → stumble 踉跄 0.45s(倒退+禁射+打断点射)。每发都有:闪白
  (爆头 0.22s 更久)+ 沿弹道击退(甲击减半)+ 打断瞄准。命中端材质分化:
  甲上火花+金属叮,肉上血雾顺弹道喷(main 命中循环)。
- HUD 隐藏走 `body.in-menu` CSS(visibility);进入后 420ms 淡入。
- 装备整备 = 先开门进入战场,1s 后自动 bpToggle 开背包。

### 字体(Google Fonts,免费可商用;用户审批的 1+2+3 组合)
- 站酷庆科黄油体 = HUD/标题/波次横幅(canvas floater 加 `font:'hy'` 字段);
  站酷快乐体 = 伤害数字/连杀(canvas 默认字体串 + .odo-col);思源黑体 Noto Sans SC = 全部 DOM 正文。
- main.js 顶部 document.fonts.load 预载三种字号;离线自动回退系统字体,不会白屏。
- fonts.html 是审批预览页(改字体方案时更新它给用户看)。

### 手感层(P0 juice,main.js "手感层状态"块)
- **全部走真实时间**,在 frame() 里衰减,不进 step()(世界时停时它们照常走):
  hitStopT(全局顿帧,玩家侧事件专用)/ killSlowT(击杀慢放)/ slowCd(慢放冷却 1.4s,防连杀锁慢动作)/
  trauma(震动)/ lowHpA(低血量)/ heartT(心跳相位)/ streak(连杀)/ fullMsgT。
- **子弹时间合成优先级**:轮盘/背包 0.08 > 顿帧 0.02(硬切入、平滑出)> 击杀慢放 0.32 > 1。
  顿帧必须 `timeScale = Math.min(timeScale, 0.02)` 硬切,慢放走指数平滑。
- **敌人受击/击杀 = 个体冻结,不是全局顿帧**(用户明确:全世界卡顿是 bug):
  `Dummy.freezeHit(dur)` 抓全身刚体位姿快照,game.js 在每次 world.step 后 `pinFrozen()` 回填,
  期间 Dummy.update 短路(AI/计时器全停),到点释放、击退/飞掷接着演。
  击杀 0.055s(爆头 0.085)、近战命中 0.025s。重生时必须清 freezeT/frozen(spawnEnemy 已做)。
- **击杀手感**:个体冻结+震动+爆浆每杀都给;**慢放是里程碑奖励**(仅 streak%5==0;清场最后一杀/爆头不触发 —— 用户指定) —— 连杀满 5(streak%5==0,
  0.8s 大慢放)或清场最后一杀(0.5s)才触发,普通击杀不慢放(用户反馈:每杀都慢放适得其反)。
  died 事件的 zone/dir 由 Dummy.hit→hurt→die 一路带出来(爆头冻得更久、爆浆沿弹道方向)。
- **低血量表现死亡即灭**:lowHpA 的目标计算带 `pstate.hp > 0 && !player.ragdoll` 条件,
  否则死亡后红晕心跳还挂着(用户毙过)。
- **trauma 震动**:抖动 = trauma²,偏移/微旋转用分层正弦伪噪声 nz()(不是随机数,
  随机会闪烁);cam.oX/oY/oR 每帧在 updateCamera 算好,drawWorld 内 w2sC 也吃偏移
  (狙击镜自建相机没有震动字段 → 用 `camO.oX || 0` 兜底);render() 里世界绕中心旋转
  cam.oR,全屏遮罩层(红闪/白闪/vignette)不参与旋转。
- **低血量**:hp<35% 起,红晕(REDVIG 径向渐变,心跳正弦脉动)+ 双响心跳音(62/55Hz)+ 
  主链低通闷化(master→muffle 700~16000Hz)。所有 beep/noiseBurst 接 outNode()。
- **decals**:弹孔(打墙)/血渍(击杀),上限 90 FIFO;drawWorld 在 terrain 后绘制。
- **连杀**:3s 窗口,≥2 显示;**顶部居中公告位**(调研:里程碑公告挂中央,持续量表才挂角落);
  滚轮数字 = 固定 2 位补零,每位竖排 0-9 胶片 translateY 滚动(cubic-bezier 过冲);阶梯配色
  (双杀淡金 → 五连杀金 → 杀神橙 → 天下无双红);n%5==0 触发 .big 整块弹跳;死亡清零。
  里程碑标签 双杀/三连杀/…/杀神(7+)/天下无双(10+)。
- **拾取 toast**:捡到装备右下角品质卡(词缀行+品质),2s 消失,最多 4 张;背包满时
  物品留在地上 + "背包已满!"floater(1.4s 节流)。
- 调试:`window.__feel()` = { hitStopT, killSlowT, trauma, streak, lowHpA, timeScale, menu }。
- 调试:`window.__level()` = 地形块耐久列表;`window.__hitTest(x,y)` = 命中几何探针。

### 背包 v3(吸取/突破/分解/搜尸)
- 居中卡片双页签:**装备**(左已装备区/右背包按类别分组:头盔/防弹衣/**武器词条材料**,指针拖拽)+
  **工坊**(修复/强化/锻造/**吸取词条**/**突破** + 三档开箱)。
- **吸取词条(对标 D3 卡奈魔盒提取)**:材料词条合并进目标后消失 —— 同词条数值相加
  (吸血0.3+1→1.3),异词条追加(装备词条位上限 2,主武器 4),满位该条跳过。
  枪材料(slot 'gun',搜尸得来)吸进主武器槽位词条(contra-gun-affixes,onChanged 即时刷新 gunMods)。
- **突破(替代三合一)**:3 件同槽位同品质 → 三态:升(品质+1)/不变/失败(随机失去一条词条);
  紫之前 90% 升 10% 败,紫→金 10/80/10(BT_RATE)。词条按"逐属性取三件最大值"继承。
- **分解(替代丢弃)**:♻ 两步确认,按品质+词条数折金币(DECOMPOSE_VALUE),不再产生地面物品。
- **敌人只爆金币**;装备走**搜尸**:站尸上(1.35m 内)按 Tab 开敌人装备栏,逐件拿走
  武器词条/头盔/护甲(品质=敌人波次品质,词条死亡时掷好)。尸体保留 **20s** 供搜索
  (enemies.js deadT;曾 12s 被用户嫌太快来不及搜),还有剩料的尸体头顶有金色 Tab 下沉箭头
  标记(game.js drawWorld)。
  ⚠️ Tab 路由(input.js):尸体在旁→搜尸,否则→轮盘;搜尸面板 Esc/Tab 关,走远自动关,时间走 0.08。
- **容量 BP_CAP=24**(已穿戴不占格):invIsFull/invUsedCount。
- 开箱不变(inventory.js BOXES/invOpenBox);背包的枪槽是展示位(bpSetGunInfo)。

### 尸体搜索(ui/corpse.js)
- 拿走 → invAddItem(k, quality, undefined, affixes, {gunName})(枪材料带 gunName 显示,无耐久);
  lootTaken[k] 标记,行灰化;背包满拦截(cpToast)。

### 狙击枪(hitscan + 放大镜 + 站桩)
- AWP mode='hitscan':开枪不生成子弹,发 hitscanShot 事件 → main.js castRay(slab 法射线 vs 地形 AABB)
  → beams[] 光束(0.16s 衰减三层描边)。沿途伤害:applyHitscanDamage 按沿线投影排序,
  第一个敌人全额,之后 ×stats.falloff^n(enemies 注册表接入后生效,现在注册表是空的)。
- 站桩:持 hitscan 枪时 dir 强制 0(不能走/跳),狙击只负责瞄准侦察。
- 放大镜:准星处 204px 圆形倍率视野(2.6x,离屏 scopeCv 二次渲染 drawWorld)。
  render 已重构出 drawWorld(c,camO,VW,VH,ppmZ,time) —— 主视图和放大镜共用,改渲染只改它。
  镜内越远越模糊(blur 随距玩家距离 16m→50m 增至 3.2px)+距离雾霾,模拟有效射程。
  主视图 cam.zoom 只 +5%,倍率全在放大镜里;相机向准星偏移(鼠标画布坐标算偏移量,防漂移)。
- ⚠️ 开镜相机平移量必须用鼠标的**画布坐标**算(存 mouse.cx/cy),世界坐标会被相机移动带着漂移;
- ⚠️ input.aim 每步用 aimWorld() 实时重算(画布坐标+当前相机),不能用世界快照 —— 相机动了快照就过时,
  开镜时误差放大到肉眼可见(子弹不过十字中心)。

### 防弹盾牌 / 近战(V)
- 盾牌 = 武器轮盘第 7 格(kind:'shield'):举盾强制 weapon='pistol'(一只手盾一只手枪);
  盾面挡**敌方**子弹(main.js 子弹循环里 shieldOBB 测试,同阵营子弹不挡),每次扣 damage 耐久,
  打光自动碎盾(setShield(false))。耐久 localStorage:contra-shield / contra-shield-hp。
- V 键 player.melee():0.32s 突刺(枪托捅 20 伤 / 盾牌冲撞 35 伤+击退 9m/s),
  扇形命中判定对 enemies 注册表生效(同上,敌系统接入后可用);有挥击音效+弧线尘土反馈。
- enemies 注册表:main.js 导出数组,敌人 push {x,y,radius,hurt(dmg),knockback(vx,vy)} 即接入全部伤害系统。

### 伤害系统(伤害归一 + 部位倍率 + 护甲消耗品 + 品质)
- **伤害归一**:所有武器单发基础伤害 = 1(霰弹 8 弹丸均分;词条 damage 字段保留待用)。
  部位倍率:头 ×2 / 身 ×1 / 腿 ×0.2 / **手臂不判定(子弹穿过)**。
- **品质**:QUALITY 六档 破损(灰白)/普通(深灰白)/优良(绿)/稀有(蓝)/高级(紫)/传说(金),
  各有耐久倍率 durMul 0.5/1/1.3/1.6/2/2.6 与防御倍率 defMul;随机加成词条后期再叠。
- **护甲 = 消耗品**:普通品质 头盔耐久 12 / 背心 24(ARMOR_BASE_DUR × 品质 durMul)。
  击中有护甲的部位 → 先扣护甲耐久(承伤=伤害×部位倍率);归零 → 头盔击飞(物理碎片)/
  背心碎裂(debris 碎片),之后该部位直接扣血。
- **敌人 v3(现行)**:敌人 = **AI 驱动的 Player 实例** —— enemies.js 的 Dummy 内部持有一个
  `new Player(world, spawn, { palette: 敌兵配色 })`,由合成的虚拟手柄输入驱动:
  巡航(边界来回)/驻扎(站岗)/警戒(玩家 12m 交战,16m 脱战,保持 6~10m 走位点射 2~4 发)。
  **主角的所有管线(关节骨骼/姿势伺服/卡地面修复/曲线弹道/命中部位)全部自动继承 ——
  改主角手感 = 改敌人手感**。配色在 Player 构造 opts.palette(敌兵绿头巾深色裤)。
  布置:x=10 驻扎、x=21 巡航(±5)、x=35 巡航(±4)。
- **敌人开枪**:内部 Player 走真实开火管线(stats/parts),事件抛给 main 以 faction 'enemy' 生成
  子弹(伤害归一 1),并按 stats.sfx 播放枪声(音量×0.6)。
  ⚠️ **敌人枪池排除 hitscan(AWP)**:敌人事件循环不处理 hitscanShot(会哑火),且狙击站桩会让敌人
  永久定在原地;敌人也不吃玩家主武器槽位词缀(spawnEnemy 里 gunMods 清空)。
- 受击反馈:闪白/抖动/持续受击 3 连击晕眩 0.8s;死亡 = setRagdoll(true) + deathImpulse(dir, zone)
  → 关节布娃娃倒地;**尸体受击继续受力**;活着时子弹不推人。
- **死亡动作部位化(2026-10-17)**:电机一关,关节全摆到限位 → 以前每具尸体都折叠成同款坐姿。
  现在 die() 后调 `player.deathImpulse(dir, zone)`(player.js):**爆头** = 头猛甩 + 双臂上扬 +
  身体后仰折;**腿部** = 下盘被扫飞 + 上身前扑/后仰随机;**躯干** = 双臂乱甩就地软倒;
  再叠加躯干随机翻转(1/4 概率反向滚)和全腿随机抖 → 没有两具尸体姿势相同。
  玩家被击倒/炸倒也走同一管线(combat.js / game.js blast)。⚠️ 只能在 setRagdoll(true) 之后调
  (电机已关、肢体已开地面碰撞)。
- **断肢(player.dismember,deathImpulse 开头自动调用)**:destroyJoint 撕关节,零件作为自由
  刚体飞出 —— 仍在 allBodies,绘制/落地/回收(destroy)全自动,零渲染改动;膝/肘关节保留,
  甩出去的是带关节的两截。规则:爆头必断头(+50% 断臂)、腿部断 1~2 条腿、躯干 45% 断臂 +
  22% 断腿;断口飙血粒子 + 地面血渍;断肢额外甩出速度 + 随机旋转。⚠️ 撕掉的关节从 this.j 删除
  (setRagdoll 遍历 j、update 伺服 j,悬空引用会炸)。
- **飙血(combat.onEnemyDied)**:击杀时地面泼 3 摊血渍(fx.addDecal 'blood',FIFO 上限内)+
  16 粒溅血;普通命中本就有血雾 —— 血量反馈三档:命中血雾 < 死亡溅血泼地 < 断肢喷泉。
- **下蹲 = 骑士跪(S 键,2026-10-17 替换趴下;用户手绘示意图定稿)**:`player.crouch =
  input.down && grounded`,边沿触发 `applyCrouch(on)` **换躯干碰撞体**(全身高胶囊 half 0.62 ↔
  跪姿矮胶囊 0.34):蹲下 = 换矮胶囊自然下坠 0.28m;起身 = **先把全身整体上移 0.28 再换高胶囊**
  (只挪躯干会被关节拽飞、不抬高会插地弹飞)。跪姿伺服(用户指定只改腿,手臂照常持枪瞄准):
  支撑腿 hipF 1.5 / kneeF -1.45(大腿抬平、小腿竖直踩地),跪腿 hipB -0.5 / kneeB -2.25
  (膝跪地、小腿反折贴地)—— 古代骑士单膝跪姿;蹲行 1.6 速,蹲下不能跳;受击判定盒随躯干
  整体下移,天然低姿态。
- **掉落经济**:死亡爆金币 3~8(磁吸拾取,2.2m 吸引/0.45m 入包);
  穿甲敌人死亡各 50% 掉 0 耐久同品质装备 → 入背包 → 背包 UI(G 键)修复/升级/合成(3 同品质)/锻造。
  金币与装备持久化 'contra-inv'。玩家出厂自带普通头盔+背心(已装备)。
- **反馈**:受击数字(护甲灰 17px/血伤红 21px/爆头金 30px 加粗带「爆头」前缀),
  **漫画果冻风**:快速弹出过冲 1.45x→回弹→淡出,随机横向漂移+微旋转,Comic Sans 深描边;
  玩家护甲碎裂 → 白闪+左右重影;敌人受击 → 白闪/抖动/晕眩(身上不发光,品质色只上装备)。
- 玩家护甲碎裂反馈:屏幕白闪+重影提醒,装备自动卸下进背包等修复。
- 玩家 HP 30、盔 12/甲 24,死亡 → 布娃娃倒地 2.5s → resetPlayer 复位(背包与金币保留)。
- 弹道:初速全员上调(AK46/M4 52/AWP 115/MP5 40/霰弹 38/手枪 34),加速曲线更陡
  (rampT = 0.42×寿命);玩家跳 13 且全身起跳(四肢单独给速度,否则关节拖拽跳不高)。小兵:HP 10、护甲耐久×0.5(脆,打得爽)、武器从预设池随机(不抄玩家的枪)。
- **后坐力手感(现行)**:竖直 climb 已删;每发累计热量(+= 0.26×recoil词条×熟练度因子×heatMul,
  上限 1,停火按 (0.35+0.4·skill)/s 冷却)推高散布公式;每发 -facing 水平轻推背冲量,
  熟练度越高越稳。弹道不受影响,永远指向光标。
- **枪口火舌**:render 里三层焰瓣(白芯/黄/橙)沿 flashAng 展开,长度随机抖动,
  侧瓣小火花+光晕;玩家与敌人开枪都触发。
- planck 坑:**Circle 构造是 (position, radius) 顺序**,Box 是 (hx, hy, center?, angle?),
  写反了不报编译错但运行时炸。
- ⚠️ 模块级 TDZ:enemies 数组声明在"子弹/粒子"区,别在使用点之前 new Dummy。
- 敌人注册表 enemies[] 约定接口:{x, y, radius, alive, zoneAt(px,py), hit(zone,dmg)→{broke,absorbed},
  hurt(dmg), knockback(vx,vy), draw(...)} —— AWP 穿透/近战/盾撞都走这套。

### 空中部队(entities/airunit.js)—— 武装直升机母体机 Gunship + 自杀无人机 Drone

- **母体机 = 骨骼关节机体**(布娃娃思路的飞行版):5 刚体 = 机身(主碰撞体)/尾梁+垂尾/起落橇/
  主旋翼/尾旋翼,4 个 RevoluteJoint 挂接(尾梁 ±0.1、橇 ±0.08 限位 → 飞行甩动;双旋翼是电机
  关节常转, purely 视觉)。飞行 = 机身 gravityScale 0 + 每步 setLinearVelocity(P 控制器追悬停
  锚点:玩家侧向 6.2m / 头顶 4m,随 groundYAt 起伏)+ 俯仰用角速度 PD(朝速度方向点头)。
  **被击落**:全体部件 gravityScale 置 1、旋翼电机减速、翻滚坠地,触地 → blast(范围伤害吃玩家
  防御+冲击波掀飞)+ 金币 + 碎片 → destroy() 刚体再置 destroyed(回收防泄漏,同 Dummy 教训)。
- **碰撞层 AIR=0x8**(airunit.js 本地常量):全部件只与 GROUND 碰撞(坠机要落地),groupIndex -7
  部件互不碰撞;主/尾旋翼 maskBits 0 不参与任何碰撞。
- **弹丸契约**:zoneAt = 机身(0.95×0.4)/尾梁(0.75×0.15)判 'body'(金属:无部位倍率无护甲),
  旋翼不判定 = 子弹从桨缝穿过(手感好);hit() 的击退不能直接 setLinearVelocity(速度控制每帧
  覆盖),走 pushX/pushY 偏移积累 + 每帧 ×(1-6dt) 衰减。
- **命中反馈分叉**(combat.js):`e.airUnit` → airHitFeedback(火花+金属叮+橙金数字+吸血照常),
  否则血肉管线 hitFeedback。弹丸命中端与 AWP hitscan 端都要分叉。
- **武器**:机炮点射 7~10 发/0.085s(伤害 7.5,敌方统一 ×0.35 → 2.6/发,armorDmgMul 1.4 磨甲),
  火箭齐射 2 发/5.5s(stats.rocket:true → spawnBullet 携带 rocket 标志:粗橙尾焰+拖烟,砸地形
  开坑),都要求 slab LOS(同 Dummy.hasLOS)。开火事件复用 'shot' 类型(game.js 通用敌方处理)。
- **无人机 = 纯算法实体(无刚体)**:接近(悬停玩家上前方 ±1.7,+3.1,入态缓 1s)→ 4.4m 内俯冲
  (直线 11m/s + 啸声 + 红拖尾)→ 撞玩家 blast 7 伤 / 撞地碎裂 / 冲过头(dist>6.5 且速度背离)
  爬升绕回再来。**一发即碎**:任意伤害 hit() → debris 碎片 + 火花,金币 1。母体机阵亡 →
  麾下无人机 enraged = 跳过接近直接扑(10m 内即俯冲)。
- **波次接入**(waves.js):第 4 波起每 4 波(+MAX_WAVE 终波)一架,hp = 130+wave×14,地面队列
  相应减小(2+wave 上限 8);**空中单位不占地面 10 名额**(capN 过滤 airUnit),但算清波条件
  (aliveN 含它们 → 不击落母体机不清波)。⚠️ `start(enemies)` 必须从 update 传注册表 ——
  曾漏传导致开波 ReferenceError 被帧循环 try/catch 吞掉,表现为"母体机波永远不出怪"。
- **新事件**(game.js 敌方事件循环):'blast'(无人机自爆/母体机坠地:火球+范围伤害吃防御+
  掀飞)、'killed'(机械击杀:金币雨+连杀,不走 onEnemyDied 的顿帧/爆浆血肉管线)。
- **机头永远面向玩家**(face: 1 右 / -1 左,0.4m 死区防抖):绘制 = 整机画在"机身局部空间"
  (translate 到机身 → **scale(1,-1) y 翻转** → rotate(fa) → scale(face,1) 镜像 → scale(ppm),
  之后是"米 + 世界 y 向上"的局部系)。⚠️ 那次 scale(1,-1) 漏了整机会**上下颠倒**(旧版逐点
  w2s 自带 y 翻转,集中到框架后必须补回),部件相对角随之用世界符号 rotate(+a);
  机炮口/火箭巢/投放口经 localToWorld(内乘 face);**zoneAt 也在 sprite 空间判定(局部 x 乘
  face)—— 尾梁画在哪边,判定就落在哪边**;俯仰公式 tilt = -v.x·k 对两个朝向都成立
  (镜像自动翻转旋转的视觉方向),别再乘 face。
- **主旋翼侧视 = 扁椭圆**:桨盘 ellipse(rx 1.25, ry 0.26)画在机身系(不随桨轴自转);桨叶
  方位角随电机转,但**桨尖坐标永远压进扁椭圆 (cosθ·1.18, sinθ·0.26) 且直接画在机身系** ——
  曾把桨叶画进"随桨轴自转的坐标系",扁椭圆跟着桨叶转歪(斜穿机身)。尾旋翼是竖直平面旋翼,
  侧视近整圆,维持圆盘画法。无人机独眼 scale(±1,1) 翻向飞行方向。
- 血条:drawEnemyBars 支持 e.noBar(无人机不画)/ e.barW(母体机 120 宽)/ e.barDy(悬在旋翼上)。
- 调试:`window.__spawnGunship(hp=260)`。
- ⚠️ **__frameN 前台污染**:每次手动 frame() 都会 requestAnimationFrame 再注册一个回调,
  前台页面这些回调会在后续真实帧成批执行(+acc 残账)→ 游戏时间莫名漂移。前台验证用真实
  时间等待;只有后台标签页(rAF 暂停,回调永不执行)才能用 __frameN 确定性推帧。

### 装备工坊(asset-studio.html + studio.js)—— ⚠️ 已暂缓,入口已移除
> 用户上传 PNG 自动抠图换贴图的工坊:技术管线(自动去底/渐变扩散/自动裁边/标准框适配)都已
> 调通并验证,但"用户图→游戏内摆放"的实际效果反复达不到预期,按用户决定暂时搁置。
> 文件保留(asset-studio.html / studio.js / drawEquip 的 img+crop 支持),game.html 入口已删,
> localStorage 的 contra-assets 相关键已清。复活入口:game.html 加回 pill 链接即可。
- 用户 PNG → 抠图(加载时**自动四角取色去底**;取色容差/只抠连通/渐变背景 borderFlood
  边缘种子+滚动参考色扩散/橡皮擦/撤销)→ 存素材库 contra-assets(id -> dataURL,≤512px,
  保存时**自动裁掉透明边** —— 不裁的话摆放坐标会被透明边距带偏;边缘大多不透明会警告背景残留)。
- 保存素材后**自动摆到当前槽位**(用户不用去素材库里挑,避免误点旧素材),且**替换**槽内旧摆放;
- ⭐ 摆放是"换贴图"式:上传图等比适配进 SLOT_BOX 标准框(= 预设头盔/防弹衣所占区域,
  head: -38,-48,76,40 / torso: -38,-50,76,100),contain + 居中 —— 位置天生和预设一致,
  用户零对齐成本;拖动/滚轮/旋转只做微调,「对齐标准位置」一键复位。
  (自由摆放的旧方案已废弃:用户拖的是可见内容,存的是画布中心,必然错位)
- 素材库缩略图垫浅色棋盘格(深色背景残留一眼可见),双击缩略图删除素材。
- 穿戴台:素材拖到简版小人身上(拖动/滚轮缩放/Shift+拖旋转),按槽位给默认尺寸(头 64px/躯干 120px 宽),
  保存写入 contra-equip-head/torso(与设计器同键,游戏实时生效)。
- ⚠️ 装备 parts 支持图片零件 {img: 素材id, x, y, w, h, rot, crop?{sx,sy,sw,sh}},drawEquip 按 id
  从 loadAssets() 取图(HTMLImage 缓存,未就绪先跳过);编辑器 eqDraw 对 img 零件只画占位虚线框。
- ⚠️ crop = 素材的透明边裁剪区:**摆放时(studio 的 croppedImg)对老素材统一补裁**,
  保存时实时取最新 crop(图片异步就绪前摆放的零件也能拿到);游戏端 crop.sw≤0 回退整图。
  没有这套裁剪的话,用户拖的是"看得见的头盔",存的是"整个画布中心",游戏里位置必然错位。
- ⚠️ drawEquip 在 facing === -1 时整体 scale(-1,1)(纸娃娃镜像):图片零件有方向性,
  转向时必须跟着翻,否则头盔"背对"朝向。预览端(studio)也画槽位锚点十字 + 随旋转的选中框。
- ⚠️ 工坊/编辑器/游戏同源共享 localStorage —— 测试时写的测试素材和穿戴会污染用户存档,测完要清理。
- 手枪渲染:滑套画在轴线上方(-y),gunMirrored(朝左)时 scale(1,-1) 垂直镜像 ——
  不镜像的话朝右打手枪上下颠倒(滑套跑到下面)。

### 皮肤工坊(skin-studio.html + skin.js)——自绘主角八件套 + 装备外观 DIY
> 用户手绘简笔画(白底)上传 → 自动抠白底/裁边 → **标记上端/下端自动转正** → **拖动微调+缩放** →
> 贴到 头/躯干/大臂/小臂/大腿/小腿(皮肤层) + **头盔/防弹衣(装备外观层)**。
> 模式 = Drawn to Life 分件换肤:贴图跟着物理刚体走,跑步/翻滚/布娃娃死亡全部自动正确,零动画成本。
- **处理在上传时一次完成**(domain/skin.js):四边平均色当背景参考 → 边缘连通洪水抠白(默认「保留
  内部白」;调容差会对原图重处理)→ 近白软边 → 自动裁边;`orientSkinImage(src, ax, ay, bx, by)` 按
  用户点的"上端→下端"两点把素材旋转转正(任意角度都行,躺着画的/拍歪的都救得回来)再重裁边。
- **SKIN_BOX 是部件标准框的唯一事实源**(皮肤八件,米):游戏渲染(skinCap/skinEquip)、工坊编辑器、
  组装预览三处共用 —— 保证不错位不偏移的根基就是"别处不准再写一份尺寸"。**框是"视觉框"不是
  物理碰撞盒**:刻意比碰撞盒大且相邻框互相搭接(头框底 +0.35 接躯干顶 +0.34;四肢子段伸过关节
  0.02~0.04m)—— 碰撞盒之间天生有缝,不搭接的话拆掉护甲后部件之间会露空挡(用户实测毙过)。
- **适配规则(skinFitScale,米/像素,返回 {sx,sy})**:
  - **四肢 = 拉伸填充**:不管画多细都撑满部件框的宽和高(Drawn to Life 式模板填充)——
    简笔画细线条腿按长度定标会渲染成 1~2px 细线(用户实测"腿太细、小腿看不见"毙过);
    素材内部比例忠实保留(细杆+宽鞋 → 杆仍比鞋细),想粗就画粗。
  - **头/躯干/头盔/背心 = 按长度定标**(高度填满,宽度随素材钳 2.2×,头 1.8×):躯干框竖长,
    contain 会把方形躯干压成 1/3 高(用户实测毙过),拉伸又会把宽躯干压窄。
- **端点锚定(SKIN_END_ANCHORED:foreArm/calf)**:这两件的图片**底边对齐身体末端**而不是居中 ——
  小臂末端 = 手 = **枪的握点**(枪系统锚定在 armLF 刚体末端,枪画在那、握把在那),小腿末端 = 脚底落地点。
  手画在小臂素材最下端就自动握在握把上(居中时手会飘到枪尾撞针那头,用户实测毙过)。工坊编辑器有
  绿色虚线"手/脚对齐线"可视化这条锚点。
  ⚠️ 两条小腿都必须走 skinCap:近侧腿块曾只写了"跳过程序靴"的判断、漏了 skinCap(legLF,'calf')
  本体 —— 近侧小腿整条不画,用户看到"只有一条小腿"(v1 就埋的漏网,排查靠像素行宽扫描)。
  ⚠️ skinFitScale 返回的是**米/像素**,调用处必须再乘 ppm(player.js)/mEPPM(编辑器)/PPM2(预览)——
  曾漏乘把皮肤画成 0.3px 高的隐形人(渲染无报错,只有 drawImage 打点统计才抓得到)。
- **渲染约定**(player.js `skinCap`/`skinEquip`):贴图 contain(等比,绝不拉伸)进标准框 × 用户 scale,
  再加用户 ox/oy 偏移(工坊里拖出来的三个数,part 局部空间);竖直方向、上端=根(头顶/肩/髋)、
  下端=端(下巴/手/脚);头/躯干/头盔/防弹衣随 facing 镜像(只翻皮肤层,装备层 drawEquip 自带);
  远侧肢 `ctx.filter='brightness(0.72)'` 压暗。
- **头盔/防弹衣 = 装备外观层**:仅在该部位真的穿着护甲时显示,替代视觉预设(数值/耐久仍走背包装备);
  头盔锚在头部局部空间(框中心=头圆心)、防弹衣锚在躯干局部空间。
- **分层**:皮肤=底层,头盔/防弹衣=外层;某件没画就回退该件的程序绘制/预设。有小臂图隐藏程序小手、
  有小腿图隐藏程序靴。**只给主角**:`useSkin = !opts.palette`,敌人不吃皮肤。
- 存档 v2:`parts[p] = { src, ox, oy, scale }`;v1 旧档缺字段默认 0/0/1(自动兼容)。
- ⚠️ 上屏很小(全身 ~81px):提醒用户笔画粗、颜色亮;素材比标准框细长时 contain 会缩得更小,属正常。
- ⚠️ 工坊页模块级调用顺序:`SKIN_PARTS.forEach(redrawSlot)` 必须在 `drawAssembled` 定义之后(TDZ)。
- 调试:`window.__skinTest(part, drawFn)` 注入合成白底图;`__skinMark(part, ax,ay, bx,by)` 直调端点
  转正;`__skinXf/__skinInfo/__skinSave`;游戏页 `window.__skin = { skinImg, skinXf, loadSkin }`。
- ⚠️ 后台标签页测皮肤:rAF 暂停会让画布停在"图片解码完成前"的旧帧 —— 必须先推 1 帧创建 Image、
  等 ~700ms 解码、再 `__frameN` 重渲染,然后才采样像素(AGENT.md 坑 7 的皮肤版)。

### 素材化(枪声 + 背景)
- 枪声:public/sfx/*.wav(CC0/CC-BY,署名见 ASSETS.md),main.js fetch+decodeAudioData 缓存,
  playGunSfx(词条 {file,rate,vol}) 播放,缺失自动回退合成音。玩家音量 1x,敌人 0.55x。
- 背景:public/bg/ 五层视差素材(CC0 ansimuz 山峦黄昏),level.js drawTiled 平铺+视差,
  夜色压暗 0.34;前景树层 drawForeground 在世界之上画(纵深)。旧山脊函数保留未删。
- ⚠️ 改 level.js/main.js 后若 HMR 不生效(浏览器报 export 缺失但文件明明有),touch 文件强制重转。

### 性能(卡顿治理)
- 固定步长累积器必须钳制(acc = min(acc+dt, 0.1)):掉帧后追不回来会进入持续追赶卡顿。
- 天空预渲染离屏画布、晕影渐变缓存、noiseBurst 音频缓冲只合成一次、HUD 文本脏检查 ——
  每帧新建渐变/音频缓冲对象是 GC 卡顿的主要来源。
- 防线:frame() 整体 try/catch(渲染异常不再杀死 rAF 链,存 __lastFrameError);
  updateCamera 检测非有限值自动复位(存 __camDiag)。相机 NaN 曾拖崩整条渲染链。

## 已踩过的坑(重要!)

1. **planck `fixture.setFilterData()` 是整体替换**——只传 `{maskBits}` 会把 categoryBits
   置 undefined、碰撞全失效。必须三字段全传 `{categoryBits, maskBits, groupIndex}`。
2. **面朝翻转时肘/膝关节限位必须镜像**(`setLimbMirror`):朝左时肘 [-2.4,-0.02]、
   膝 [-0.02,2.4],IK 的肘部 branch 也要换(δ1=β+θ)。否则左向全是"反关节"。
   **且 setLimbMirror 必须在 facing 完全确定(鼠标覆盖按键)之后调用**——
   后退(按左+瞄右)时限位停在镜像态,肘会被限位以 >60N·m 顶死在伸直位。
3. **视觉元素用亮色 + 深描边**:夜色背景,深色装备/枪械完全看不见,被毙过两次。
4. **武器外观必须走设计器**,程序化画的枪被用户毙了("太丑")。
5. **调试瞬移角色必须整体重建**(`player.spawn=…; player.reset()`),只 setPosition
   躯干会被关节拽飞,测出来的数据全是假象。
6. **合成测试事件派发给正确的目标**:mousemove 要派发给 canvas(监听在 canvas 上);
   且用户可能正开着页面玩,测试样本会被真人输入污染,异常数据先怀疑这个。
7. 后台标签页 rAF 暂停,canvas 抓帧全黑不是 bug;调试截图用 `canvas.toDataURL()`。
8. **未定义标识符 + HMR 旧缓存叠加 = "改了也没效果"的假象**:gunPresets.js 里 `SND`
   漏定义(只定义了 `SFX`)导致模块求值即崩,但浏览器跑着旧缓存模块继续玩——
   旧版 sfx 是废弃的文件格式,gunSynth 读 `f0` 全 undefined → 静音。排查口诀:
   页面行为和磁盘代码对不上时,先 `node --check` + 全局扫"调用了但没定义"的标识符,
   再清 `node_modules/.vite` 重启 dev server 强刷。同类残留:main.js 里
   `fetchSfxFiles()`(已废弃的文件音效方案)调用没删,每次手势都抛 ReferenceError。
9. **WebAudio 自动播放策略**:即使在手势处理器里 new AudioContext,也可能停在
   suspended;initAudio 里必须显式 `actx.resume()`。声音排查用 `window.__actx()`
   看 state:'suspended' = 被策略拦,'running' = 正常;再数 createOscillator/
   createBufferSource 是否被调用定位是"没出声"还是"没合成"。
10. **动画计时器设了就要衰减**:护甲碎裂白闪 `ghostT` 曾只赋值 0.45 从不递减,
    整屏常白。所有 `-T` 后缀计时器统一在 step() 尾部 `Math.max(0, x - dt)`。
11. **自动化测 DOM 拖拽用合成 PointerEvent**:浏览器自动化工具的 drag/click 在部分环境
    不把事件派发进页面(且每次 open 都会重新导航,页面状态会重置)。游戏监听器是普通
    DOM 监听,不依赖 isTrusted —— `el.dispatchEvent(new PointerEvent(...))` 三连
    (down 在元素上 / move+up 在 window 上)即可完整驱动拖拽逻辑,结果可信。
12. **事件派发处理器里的 ReferenceError 是"静默"的**:dispatch 出去的 keydown 里 hook 名写错
    (如把 openCorpse 写成属性名 corpseOpen)不会中断测试流程,错误只进 `__pageErrors` ——
    "按键没反应"先查 __pageErrors 再怀疑逻辑(搜尸 Tab 失灵排查了半小时才看到这条)。
13. **瞬移布娃娃/尸体必须整体平移所有刚体**(坑 5 的尸体版):只 setPosition 躯干,肢体关节还
    在原地,关节求解器一帧内把躯体弹飞十几米 —— `for (const b of p.allBodies) b.setPosition(同
    delta)` 且速度清零。⚠️ planck 里 getPosition() 返回内部向量引用但每步从 sweep 重算覆盖,
    直接改 p.x 无效,必须 `b.setTransform(getTransform() 改过的完整 xf)`。
14. **全身胶囊只属于站姿**:躺倒后它是一根 1.24m 的横棍,把四肢从包络里往外挤、再顶地面,
    求解器两头打架 = 尸体在地上抖来抖去(用户实测毙过)。死亡/布娃娃必须换"死亡小盒"
    (setRagdoll → swapTorsoCapsule(0),只包躯干本体 0.30×0.52,四肢交给自己的地面碰撞)。
15. **给 enemies 注册表加新单位时,弹丸尸体分支的契约是 zoneAt+corpseHit 成对**:坠落中的
    Gunship 曾只挡 zoneAt 不给 corpseHit → 每颗子弹 TypeError 整帧被 try/catch 吞。
    现已双保险:死亡态 zoneAt 返回 null + stepBullets 用 `e.corpseHit?.()`。
16. **卡地保险丝必须用"正下方 ray",不能用 groundYAt(x, p.y+0.5)**:后者返回"低于头顶 0.8m 内
    的最高表面顶",会把身旁台阶/平台顶误当地表 —— 玩家从矮台阶旁走过(x≈26 顶面 1.0 的地块)
    被判沉地,0.5s 后莫名传送回重生点(用户实测毙过)。现行:updateCommon 从躯干中心向下 ray
    0.5m,命中距离 < 0.1 才算真卡地(站立 0.77 / 跪 0.49 / 躺 0.15 都不会误触发)。
17. **断肢必须级联撕掉下游关节(肩→肘、髋→膝)**:两截连着飞时,膝/肘限位(强制弯曲)与
    "躺平"的静止构型永远冲突,求解器每步互打 = 残肢在地上永久微抖(用户实测毙过);
    撕成独立单盒后躺平即静止。断头/断肢滚出地图边界会一路坠落(120m/s),属自然物理,
    随尸体 20s 回收,不用管。
18. **尸体/残肢的终极静止 = setActive(false),且敌我参数必须一致**:残肢落在平台 0.25m
    tile 接缝上会被相邻静态块夹住永抖(级联撕关节解决不了接缝)。休眠参数(速度阈值
    0.3m/s / 静置 0.45s / 兜底 1.4s)敌我必须同一组 —— 曾给敌人 0.2/0.7/5s,用户立刻
    观察到"主角尸体不抖而敌人抖"(差异全在参数)。位置:敌人 enemies.js 死亡分支 /
    玩家 player.js updateCommon(ragdoll+deadCorpse)。已休眠尸体的 corpseHit 直接跳过
    (防止任何 kick 把休眠刚体卷回求解器)。respawn 模式要在 spawnEnemy 复位 settled/restT。
    **运输机 TransportHeli 的绘制同样要 scale(1,-1) y 翻转**(Gunship 教训的复犯,坐标
    风格一致就一起错),且悬停高度 7.6m(8.6 会飘出画面上缘,只见绳索不见机身)。
19. **特效三件套(fx.js)**:`explosion(x,y,big)` = 冲击波环 rings + 火球(负重力上飘)+
    火花 + 烟柱 + 地面焦痕 decal('scorch',渲染层有专门分支);`bloodJet(body,lx,ly,dx,dy)`
    = 挂在刚体断口上的喷血发射器(心跳脉冲压强,跟随尸体姿态,dismember 自动挂);
    击杀锥形喷血在 combat.onEnemyDied(沿弹道方向)。火箭弹命中地形会起爆:explosion +
    对玩家 1.9m 范围冲击 + 地形伤害 ×2.4(stepBullets 的 rect 命中分支)。
20. **尸体休眠是双端的**:敌人(enemies.js 死亡分支)和玩家(player.js updateCommon 的
    ragdoll+deadCorpse 分支,deathImpulse 置位;R 键测试布娃娃不置位不受影响)都要做
    静置 setActive(false) —— 用户实测玩家尸体的残肢一样会在接缝上抖。断肢额外加阻尼
    (linear 1.4 / angular 1.8)吃掉微振动。主角阵亡有 hitStop(0.12) 顿帧(和敌人击杀同款,
    用户点名要一致)。
21. **UI 音效 = Kenney UI Pack 采样**(public/ui/kenney/*.ogg,CC0,License 同目录):
    audio.js uiSfx(kind, vol) 懒加载解码,失败静默返回 0 → 调用侧 `if (!uiSfx('click-a'))
    beep(...)` 合成音兜底。已接:菜单三按钮/场景卡(switch-a)/搜尸拿取(switch-b)/
    背包部分动作。首次点击无声(加载异步),第二次起有声,属预期。
22. **前景层(fore 槽)素材必须是"底部剪影"型,接入前先查 alpha 分布;挡人两次就别用**:
    drawForeground 画在玩家/敌人之后 —— 素材若整屏不透明(city 包的 fore.png 就是一张
    完整背景图,逐 band alpha 全 255),盖上去 = 整关看不到任何人;换底部剪影素材
    半透明仍可能糊住玩家腿部(用户两次实测毙掉)。**现行结论:港区不设 fore 槽**,
    front.png 只走 trees 槽(画在玩家后面),宁缺毋滥。验材:node zlib 解 PNG IDAT
    统计每 1/10 高度 band 的平均 alpha,正常前景素材顶部 ≥60% 高度全透明。
    far/near 层永远画在玩家后面,整屏不透明无杀伤力。
23. **尸体的 zoneAt 判定盒 = 空气墙的来源,挡弹必须按 faction 分流**:zoneAt 是躯干局部
    系的固定尺寸盒(躺倒后横占 1m+),settled 之后照样返回部位 —— 玩家朝"看着没东西"的
    地方开枪被挡,感知就是空气墙(用户实测毙过)。现行契约:玩家子弹完全穿过尸体
    (连"活敌人判定分支"都要 `!e.alive continue`,否则 hit 返回 null 仍消耗子弹+假飘字);
    敌方子弹仍被挡(尸体=玩家掩体,趣味保留)。同类守卫:zoneAt 开头 `if (destroyed)
    return null` —— planck 销毁刚体后 getPosition 还返回旧坐标,不挡就有一帧幽灵判定盒。
24. **坠落载具的"落地"判定要兜"停在支撑件上"的形态**:Gunship 起落橇(+支柱)比机身
    低 0.45m,橇先着地会把机身撑住,按"机身离地 X 米"判定坠爆永远不触发 —— 残骸停在
    橇上、旋翼电机常转、机身被反扭矩顶着永抖(实测复现,用户感知的"残骸一直抖"之一)。
    兜底:坠落中连续 0.5s 速度 < 0.6m/s 即视为坠地照爆(crashStillT)。
25. **player.events 的清空必须在消费端(game.js),不能在生产端(update 开头)**:
    input.js 的 keydown 直调 melee()/grenade() 发生在帧间(rAF 任务先于下一帧),
    push 的事件若在下一帧 update 开头被 `events.length = 0` 清掉 = 静默丢失 ——
    近战伤害曾整条失效(挥了枪托没伤害,没人发现)。现行:player.update 不清事件,
    game.js 事件循环消费后清;Dummy 转发内部 Player 事件后也要就地清(否则跨帧重复转发)。
    自动化测试陷阱:__frameN 推帧在 timeScale<1(菜单 0.3/背包 0.08/顿帧 0.02)时
    一个 frame 可能积不满一个 STEP,step 没跑事件就没消费 —— 推帧后检查状态前多推几帧。

## 外观 / 装备错位排查与坐标契约（2026-10-22）

- `src/game/domain/rigGeometry.js` 是主动布娃娃尺寸、肩/颈/髋锚点与默认姿态的唯一数据源；`player.js` 和皮肤工坊的组装预览必须复用它。不要在设计器里用左右偏移常量“猜”四肢位置。
- `SKIN_BOX`（`skin.js`）仍是皮肤贴图标准视觉框的唯一数据源；`skinFitScale`、端点锚定规则必须被游戏和预览共同调用。
- 装备图像坐标的版本契约在 `src/game/domain/equipmentGeometry.js`：
  - 旧的无 `coordinateSpace` 标记的**图片零件**：`x/y` 是中心点（保留旧档兼容）。
  - 矩形零件：`x/y` 一直是左上角。
  - 新的工坊存档必须写 `coordinateSpace: 'top-left-v2'`，图片和矩形零件一律以左上角序列化；渲染中心由 `equipmentPartCenter(equipment, part)` 推导。
  - 读取旧图像件用 `equipmentPartToStudio` 转成工坊内部中心坐标；保存用 `equipmentPartToStorage` 转成规范左上角，禁止调用方自行加/减半个宽高。
- 改动以上几何规则后必须运行 `node --test tests/*.test.mjs`；浏览器回归脚本 `tests/browser-smoke.mjs` 负责验证外观即时预览/应用、旧装备存档迁移、`game.html` 渲染诊断和现有夜视/手电/门/电闸交互。GitHub Actions 工作流：`.github/workflows/appearance-alignment.yml`。

## 设计器数据格式

```js
// 枪(200px = 1m,x 向枪口,y 向下)
{ name, meterScale, parts: [{x,y,w,h,color,r}],
  grips: { front: {x,y} /*副手握前握点*/, rear: {x,y} /*瞄准手握枪把*/ },
  muzzle: {x,y} }
// 装备(原点 = 头部圆心 30px 半径 / 躯干中心 60×104px)
{ name, slot: 'head'|'torso', defense: 0~0.8, meterScale, parts: [...] }
```

## 下一步(按预期排序)

1. **敌人**:同骨架布娃娃 + 简单 AI(巡逻/发现/射击),用上 defense 部位减伤、
   命中判定(头/躯干)、死亡布娃娃(关电机)。
2. 武器切换 UI(当前 Q/1/2 快捷键,无界面)。
3. 单向平台(从下往上可穿)。
4. 音效素材化 / BGM。

## 调试入口

- `window.__game()` 返回 `{ player, world, input, bullets, beams, debris, floaters, pickups, cam, wheel, enemies, pstate, waves, decals, particles }`。
- `window.__combat` = 命中管线直调句柄 `{ spawnBullet, stepBullets, applyHitscanDamage, onEnemyDied, stepPickups, alertEnemiesNear }`(自动化测试不 import 模块,直接调它)。
- `window.__corpse` = 搜尸管线直调 `{ nearby, open, close, isOpen }`。
- `window.__feel()` = 手感层状态;`window.__level()` = 地形块数组(注意:只有 x/y/w/h/hp/max,没有 type 字段)。
- `window.__frame(t)` 手动推帧:后台标签页 rAF 整体暂停(抓帧全黑/timeScale 不动都是这个),自动化测试用它确定性地驱动主循环;`__frameN(n)` 批量推 n 帧。
- B 键物理线框;R 布娃娃;E 复位。
- 浏览器在后台时 rAF 暂停,canvas 抓帧全黑不是 bug;游戏页抓帧用 `canvas.toDataURL()`。
