# AGENT.md — AI 接手须知

> 本文档写给接手本项目的 AI 助手(也供人类参考)。读完这页,你应该知道我们在做什么、
> 为什么这么设计、哪些坑已经踩过、以及下一步该干什么。**改动前请先读完,别重复踩坑。**

## 项目是什么

**魂斗罗·布娃娃(2Doll Game)**:一个 2D 魂斗罗风格的射击游戏,主角是
**主动式布娃娃(active ragdoll)**——planck.js 物理驱动的关节小人,不是帧动画。
外加一个配套的**武器与装备设计器**(用户拼枪、标握点、定制头盔/防弹衣,游戏内实时生效)。

当前状态:主角完成且手感验证过(走/跳/趴/双武器/鼠标瞄准/镜像/布娃娃测试),
**波次生存玩法已上线**:敌人右缘按波刷新(15 波,无甲→全金装),真实伤害 + 部位倍率 + 小血条 + 受击闪白 + 金币/装备掉落(品质光柱)。

## 技术栈与运行

- Vite 6 多页应用,原生 ES 模块,**无框架**;渲染全部手写 Canvas 2D。
- 物理引擎:planck.js 1.5.1(Box2D 纯 JS 移植),y 轴向上,重力 (0, -30)。
- `npm install` → `npm run dev` → http://127.0.0.1:5199/game.html(port 5199,strictPort)。
- `npm run build` 需要 vite.config 里 `build.target: 'es2022'`。
- ⚠️ 本机器全局 npm/git 代理指向 127.0.0.1:7890(Clash),**push/拉取 GitHub 前先开代理**;
  项目 `.npmrc` 已置空 npm 代理并指向 npmmirror,别删。

## 页面与目录

```
game.html             游戏页面
weapon-editor.html    武器与装备设计器
src/game/
  main.js             主循环:输入/相机/子弹/粒子/音效/HUD/子弹时间
  player.js           ★ 核心:主动式布娃娃主角(物理、双臂 IK、姿态、开火、穿戴)
  wheel.js            武器/装备轮盘(GTA式:按住Tab唤起+子弹时间+扇区选择+卸下/选中)
  enemies.js          敌人 = AI 驱动的 Player 实例(波次模式不重生)
  waves.js            波次管理器(右缘刷新/品质难度曲线/15 波上限)
  level.js            地形数据与绘制、碰撞分类常量(CAT)
  gunPresets.js       枪械/装备数据格式、预设、localStorage 读写
  editor.js           设计器逻辑(拼枪 + 装备定制)
```

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

### 熟练度(后坐力已按用户要求移除)
- `player.skill` 0.1~1(localStorage `contra-skill`),每枪 +0.006。
- `player.heat` 热量只影响散布:散布 = (0.012+0.075·heat)·(1.35-0.75·skill)。
- 弹道永远精确指向光标(无上抬/无震颤/无推背)——别把后坐力系统加回来。

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
| `contra-equip-head` / `contra-equip-torso` | 头盔/防弹衣(parts + defense) |
| `contra-skill` | 熟练度 |
| `contra-shield` / `contra-shield-hp` | 盾牌是否装备 / 耐久 |

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
- 后坐力系统已按用户要求整体移除(无上抬/无震颤/无推背);别加回来。

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
- 受击反馈:闪白/抖动/持续受击 3 连击晕眩 0.8s;死亡 = setRagdoll(true) + 最后一击方向力道
  → 关节布娃娃倒地;**尸体受击继续受力**;活着时子弹不推人。
- **死亡受力**:最后一击的子弹方向作用在布娃娃上(不同方向=不同倒地动作);
  活着时子弹不推人;**尸体受击继续受力**(布娃娃残响)。
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
- **后坐力手感**:recoilClimb 累计(每发 +=(0.010+0.012×recoil)×宽限系数,
  前三发系数 0.25 渐升,停火 0.4s 重置);弹道与枪口视觉都 + climb×facing;
  停火 0.13s 后 climb 按 2.4/s 回落。鼠标下压 = aim 下压,天然对抗上抬。
- **枪口火舌**:render 里三层焰瓣(白芯/黄/橙)沿 flashAng 展开,长度随机抖动,
  侧瓣小火花+光晕;玩家与敌人开枪都触发。
- planck 坑:**Circle 构造是 (position, radius) 顺序**,Box 是 (hx, hy, center?, angle?),
  写反了不报编译错但运行时炸。
- ⚠️ 模块级 TDZ:enemies 数组声明在"子弹/粒子"区,别在使用点之前 new Dummy。
- 敌人注册表 enemies[] 约定接口:{x, y, radius, alive, zoneAt(px,py), hit(zone,dmg)→{broke,absorbed},
  hurt(dmg), knockback(vx,vy), draw(...)} —— AWP 穿透/近战/盾撞都走这套。

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

- `window.__game()` 返回 `{ player, world, input, bullets, wheel }`。
- `window.__frame(t)` 手动推帧:后台标签页 rAF 整体暂停(抓帧全黑/timeScale 不动都是这个),自动化测试用它确定性地驱动主循环。
- B 键物理线框;R 布娃娃;E 复位。
- 浏览器在后台时 rAF 暂停,canvas 抓帧全黑不是 bug;游戏页抓帧用 `canvas.toDataURL()`。
