// Narrative state machine for the first playable HERO campaign chapter.
// Kept free of DOM, timers, and storage so progression can be tested in Node.
export const RAID_CAMPAIGN_SAVE_KEY = 'contra-raid-campaign-v1';
export const RAID_CAMPAIGN_TITLE = '夜幕行动：失联名单';

const BRIEFING = [
  { speaker: '指挥台 · 黑匣', text: '夜隼，目标楼内藏着一份“失联名单”。名单记录了被转移人员的去向。取回线索，确认现场安全后撤离。' },
  { speaker: '夜隼', text: '收到。绳降完成后，我先清理屋顶，再沿中央楼梯逐层推进。' },
  { speaker: '技术员 · 小麦', text: '建筑供电和敌方警戒相连。断电能压低照明，但枪声和被发现的尸体仍可能引来增援。别让楼梯口变成火力陷阱。' },
];
const FLOOR_DIALOGUE = {
  3: [
    { speaker: '指挥台 · 黑匣', text: '屋顶已清。中央楼梯贯通每一层；守军可能在楼梯平台交叉搜索，先确认落点，再进入房间。' },
  ],
  2: [
    { speaker: '技术员 · 小麦', text: '三层的通信设备被拔走了，只剩断开的线缆。有人不想让这栋楼留下记录。继续向下。' },
  ],
  1: [
    { speaker: '夜隼', text: '二层发现转运箱，里面的标签全被撕掉了。名单还没找到。' },
    { speaker: '指挥台 · 黑匣', text: '明白。地面入口配电柜仍在线，清场后回到那里，我会用它发出撤离信号。' },
  ],
  0: [
    { speaker: '夜隼', text: '地面已清，通路安全。准备封存现场记录。' },
    { speaker: '指挥台 · 黑匣', text: '别急着离开。返回地面入口的配电柜，按 E 发出撤离信号。' },
  ],
};
const EXTRACTION = [
  { speaker: '夜隼', text: '入口控制柜已接入。现场记录加密封存，正在发出撤离信号。' },
  { speaker: '指挥台 · 黑匣', text: '数据已收到。名单里多出的那些名字，说明这不是一次普通的剿匪行动。带着证据回来，夜隼——下一站，我们去找签字的人。' },
];
const CLEAR_ORDER = [3, 2, 1, 0];

function copyLines(lines) {
  return lines.map((line) => ({ ...line, duration: 5.8 }));
}

function enqueue(state, lines) {
  state.dialogueQueue.push(...copyLines(lines));
}

export function createRaidCampaignState(enabled = false) {
  return {
    enabled: !!enabled,
    stage: enabled ? 'insertion' : 'inactive',
    announcedFloors: [],
    dialogueQueue: [],
    activeDialogue: null,
    dialogueRemaining: 0,
    elapsedSeconds: 0,
    completed: false,
  };
}

export function resetRaidCampaignState(state, enabled = false) {
  const fresh = createRaidCampaignState(enabled);
  Object.assign(state, fresh);
  return state;
}

export function getRaidObjective(campaign, clearedFloors = {}) {
  if (!campaign?.enabled) return '';
  if (campaign.completed || campaign.stage === 'complete') return '行动完成 · 失联名单已封存，记录已保存';
  if (campaign.stage === 'insertion') return '正在绳降 · 稳住姿态，准备进入屋顶';
  if (!clearedFloors[3]) return '目标 01/04 · 清理屋顶守军，找到中央楼梯入口';
  if (!clearedFloors[2]) return '目标 02/04 · 沿中央楼梯进入三层，清剿本层守军';
  if (!clearedFloors[1]) return '目标 03/04 · 进入二层，压制残余守军';
  if (!clearedFloors[0]) return '目标 04/04 · 清理地面入口，确认撤离通路';
  return '返撤目标 · 返回地面入口配电柜旁，按 E 呼叫撤离';
}

export function updateRaidCampaign(campaign, dt, facts = {}) {
  if (!campaign || !facts.enabled || campaign.completed) return campaign;
  campaign.enabled = true;
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (facts.playerAlive) campaign.elapsedSeconds += safeDt;

  // Radio starts only after the insertion animation finishes and the player can act.
  if (campaign.stage === 'insertion' && facts.rappelDone && facts.playerAlive) {
    campaign.stage = 'assault';
    enqueue(campaign, BRIEFING);
  }

  const cleared = facts.clearedFloors || {};
  for (const floorId of CLEAR_ORDER) {
    if (!cleared[floorId] || campaign.announcedFloors.includes(floorId)) continue;
    campaign.announcedFloors.push(floorId);
    enqueue(campaign, FLOOR_DIALOGUE[floorId] || []);
  }

  const allClear = CLEAR_ORDER.every((floorId) => !!cleared[floorId]);
  if (allClear && campaign.stage !== 'extract' && campaign.stage !== 'complete') {
    campaign.stage = 'extract';
    enqueue(campaign, EXTRACTION);
  }

  if (facts.playerAlive) {
    if (campaign.activeDialogue) {
      campaign.dialogueRemaining = Math.max(0, campaign.dialogueRemaining - safeDt);
      if (campaign.dialogueRemaining <= 0) campaign.activeDialogue = null;
    }
    if (!campaign.activeDialogue && campaign.dialogueQueue.length) {
      campaign.activeDialogue = campaign.dialogueQueue.shift();
      campaign.dialogueRemaining = campaign.activeDialogue.duration;
    }
  }
  return campaign;
}

export function advanceRaidDialogue(campaign) {
  if (!campaign) return null;
  campaign.activeDialogue = null;
  campaign.dialogueRemaining = 0;
  return campaign;
}

export function completeRaidCampaign(campaign) {
  if (!campaign || !campaign.enabled || campaign.stage !== 'extract' || campaign.completed) return false;
  campaign.completed = true;
  campaign.stage = 'complete';
  campaign.activeDialogue = null;
  campaign.dialogueRemaining = 0;
  campaign.dialogueQueue.length = 0;
  enqueue(campaign, EXTRACTION);
  campaign.activeDialogue = campaign.dialogueQueue.shift() || null;
  campaign.dialogueRemaining = campaign.activeDialogue?.duration || 0;
  return true;
}
