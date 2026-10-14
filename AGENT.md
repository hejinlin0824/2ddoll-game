# AGENT.md — AI 接手须知

> 本文档写给接手本项目的 AI 助手(也供人类参考)。读完这页,你应该知道我们在做什么、
> 为什么这么设计、哪些坑已经踩过、以及下一步该干什么。**改动前请先读完,别重复踩坑。**

## 项目是什么

**魂斗罗·布娃娃(2Doll Game)**:一个 2D 魂斗罗风格的射击游戏,主角是
**主动式布娃娃(active ragdoll)**——planck.js 物理驱动的关节小人,不是帧动画。
外加一个配套的**武器与装备设计器**(用户拼枪、标握点、定制头盔/防弹衣,游戏内实时生效)。

当前状态:主角完成且手感验证过(走/跳/趴/双武器/鼠标瞄准/镜像/布娃娃测试),
**还没有敌人**——敌人 AI 与伤害系统是下一步。

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
  main.js             主循环:输入/相机/子弹/粒子/音效/HUD
  player.js           ★ 核心:主动式布娃娃主角(物理、双臂 IK、姿态、开火、穿戴)
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

### 熟练度与后坐力
- `player.skill` 0.1~1(localStorage `contra-skill`),每枪 +0.006。
- `player.heat` 后坐力热量,开枪积累、随时间消退;散布 = (0.012+0.075·heat)·(1.35-0.75·skill)。
- 手臂后踢、推背冲量、开火时锚点前顶也随熟练度衰减。

### 武器与装备(全部 localStorage 持久化,设计器保存后 storage 事件跨标签页实时生效)
| 键 | 内容 |
|---|---|
| `contra-gun-primary` | 主武器(设计器数据:parts + grips.front/rear + muzzle,200px=1m) |
| `contra-equip-head` / `contra-equip-torso` | 头盔/防弹衣(parts + defense) |
| `contra-skill` | 熟练度 |

- 主武器:双手 IK 持枪,8.5 发/秒,弹 6→34 m/s,镜头微震;副武器手枪:单手 0.22m、4 发/秒。
- 装备 = 纸娃娃挂点:头盔画在头部局部空间、防弹衣画在躯干局部空间(纯渲染+defense 数值,
  不动物理);`player.defense` 汇总显示 HUD,**未来敌人伤害系统把它用作对应部位减伤系数**。

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

- `window.__game()` 返回 `{ player, world, input, bullets }`。
- B 键物理线框;R 布娃娃;E 复位。
- 浏览器在后台时 rAF 暂停,canvas 抓帧全黑不是 bug;游戏页抓帧用 `canvas.toDataURL()`。
