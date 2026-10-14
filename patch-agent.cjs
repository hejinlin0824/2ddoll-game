// 一次性:AGENT.md 同步本轮改动(用完即删)
const fs = require('fs');
const f = 'AGENT.md';
let s = fs.readFileSync(f, 'utf8');
let ok = true;

// 1) 状态行更新
s = s.replace(
  '当前状态:主角完成且手感验证过(走/跳/趴/双武器/鼠标瞄准/镜像/布娃娃测试),\n**还没有敌人**——敌人 AI 与伤害系统是下一步。',
  '当前状态:**波次生存玩法已上线**——敌人从右缘按波刷新(15 波,无甲→全金装),\n武器真实伤害 + 部位倍率(头×2/身×1/腿×0.2)+ 敌人小血条 + 受击闪白 + 金币/装备掉落(品质光柱)。'
);

// 2) 目录补 waves.js / enemies.js
s = s.replace(
  `  wheel.js            武器/装备轮盘(GTA式:按住Tab唤起+子弹时间+扇区选择+卸下/选中)`,
  `  wheel.js            武器/装备轮盘(GTA式:按住Tab唤起+子弹时间+扇区选择+卸下/选中)
  enemies.js          敌人(AI 驱动的 Player 实例,波次模式下不重生)
  waves.js            波次管理器(右缘刷新/品质难度曲线/15 波上限)`
);

// 3) 武器词条:接通真实伤害
s = s.replace(
  '- 玩家 fireCd = 60/rpm;打空自动换弹(reloadT);霰弹枪一次 events 推 parts[N] 个弹丸。',
  '- 玩家 fireCd = 60/rpm;打空自动换弹(reloadT);霰弹枪一次 events 推 parts[N] 个弹丸。\n- **真实伤害已接通**:弹丸 damage = 词条 damage(非归一),命中端 ×部位倍率;敌人子弹 ×0.35,玩家受击再 ×(1-防御)。'
);

// 4) 移除后坐力手感段(已删),加说明
s = s.replace(
  /- 连发后坐力震颤:player\.visualShake[^\n]*\n/,
  '- 后坐力系统已按用户要求整体移除(无上抬/无震颤/无推背);别加回来。'
);

// 5) 坑:近战换弹阻塞 + 掉落物绘制 + 狙击镜尺寸
s = s.replace(
  '10. **动画计时器设了就要衰减**:',
  `10. **近战不能被换弹阻塞**:melee() 的门槛里有 reloadT > 0 会把 V 键近战静默吞掉(AK 打空自动换弹 1.6s,极易撞上),门槛只留 ragdoll/meleeT。
11. **掉落物必须有绘制代码且用亮色具体图形**:pickups 曾只有更新逻辑没有 draw(金币永远看不见),装备掉落画成文字框也被毙("太草率")——画迷你钢盔/背心图形 + 品质色光柱。
12. **狙击放大镜尺寸随画布走**:R 写死 102px,在 2000px 宽窗口里就是个毫无威力感的小圆圈;R = H × 0.3,SCV 离屏分辨率同步加大。`
);
// 10 号坑原文开头是"10. **动画计时器设了就要衰减**:护甲碎裂白闪..."—确认存在
if (!s.includes('动画计时器设了就要衰减')) { console.log('pitfall 10 NOT FOUND'); ok = false; }

if (ok) { fs.writeFileSync(f, s); console.log('AGENT.md synced'); }
else process.exit(1);
