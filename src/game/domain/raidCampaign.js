// Narrative state machine for the first playable HERO campaign chapter.
// Kept free of DOM, timers, and storage so progression can be tested in Node.
export const RAID_CAMPAIGN_SAVE_KEY = 'contra-raid-campaign-v1';
export const RAID_CAMPAIGN_CHECKPOINT_KEY = 'contra-raid-checkpoint-v1';
export const RAID_CAMPAIGN_TITLE = '夜幕行动：失联名单';

const CHECKPOINT_STAGES = new Set(['insertion', 'assault', 'extract']);
const FLOOR_IDS = [3, 2, 1, 0];

const BRIEFING = [
  { speaker: '指挥台 · 黑匣', text: '夜隼，目标楼内藏着一份“失联名单”。名单记录了被转移人员的去向。取回线索，确认现场安全后撤离。' },
  { speaker: '夜隼', text: '收到。绳降完成后，我先清理屋顶，再沿中央楼梯逐层推进。' },
  { speaker: '技术员 · 小麦', text: '建筑供电和敌方警戒相连。断电能压低照明，但枪声和被发现的尸体仍可能引来增援。锁门按 E 打开，打不开的薄门可以直接射击破坏；楼梯要从平台口进入，别对着高台边缘硬挤。' },
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
    { speaker: '技术员 · 小麦', text: '等等，二层 COMMS 机柜还有待机灯。真正的转运记录可能被藏进终端，不在那些箱子里。' },
  ],
  0: [
    { speaker: '夜隼', text: '地面已清，通路安全。准备封存现场记录。' },
    { speaker: '指挥台 · 黑匣', text: '别急着离开。返回地面入口的配电柜，按 E 发出撤离信号。' },
  ],
};
const INTEL_DIALOGUE = [
  { speaker: '夜隼', text: '终端里有三批转运记录，还有一串内部审批编号。名单不是被烧掉了，是有人把它藏起来了。' },
  { speaker: '指挥台 · 黑匣', text: '数据已收到。这个编号不属于现场匪帮。先清理地面入口，再去配电柜发撤离信号。' },
];
const EXTRACTION = [
  { speaker: '夜隼', text: '入口控制柜已接入。现场记录加密封存，正在发出撤离信号。' },
  { speaker: '指挥台 · 黑匣', text: '撤离通道已确认。别停留在入口，按计划向集合点回撤。' },
];
const EPILOGUE = [
  { speaker: '夜隼', text: '撤离信号已发出。现场最后一份记录已封存，我正在离开建筑。' },
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
    intelSecured: false,
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

export function normalizeRaidCampaignCheckpoint(raw) {
  if (!raw || raw.version !== 1 || raw.campaign !== RAID_CAMPAIGN_TITLE
      || !CHECKPOINT_STAGES.has(raw.stage) || raw.completed === true) return null;
  const clearedFloors = Object.fromEntries(FLOOR_IDS.map((id) => [id, raw.clearedFloors?.[id] === true]));
  const intelSecured = raw.intelSecured === true && clearedFloors[1];
  const allClear = FLOOR_IDS.every((id) => clearedFloors[id]);
  const anyProgress = FLOOR_IDS.some((id) => clearedFloors[id]) || intelSecured;
  const stage = allClear && intelSecured ? 'extract'
    : raw.stage === 'insertion' && !anyProgress ? 'insertion' : 'assault';
  const elapsedSeconds = Number.isFinite(raw.elapsedSeconds)
    ? Math.max(0, Math.min(60 * 60 * 24 * 365, raw.elapsedSeconds)) : 0;
  return {
    version: 1,
    campaign: RAID_CAMPAIGN_TITLE,
    stage,
    clearedFloors,
    announcedFloors: FLOOR_IDS.filter((id) => clearedFloors[id]),
    intelSecured,
    elapsedSeconds,
    completed: false,
  };
}

export function createRaidCampaignCheckpoint(campaign, clearedFloors = {}) {
  if (!campaign?.enabled || campaign.completed || campaign.stage === 'complete') return null;
  return normalizeRaidCampaignCheckpoint({
    version: 1,
    campaign: RAID_CAMPAIGN_TITLE,
    stage: campaign.stage,
    clearedFloors,
    intelSecured: campaign.intelSecured,
    elapsedSeconds: campaign.elapsedSeconds,
  });
}

export function getRaidCampaignResumeSpawn(checkpoint) {
  const cleared = checkpoint?.clearedFloors || {};
  if (!cleared[3]) return { x: 4.2, y: 10.5 };
  if (!cleared[2]) return { x: 53.2, y: 7 };
  if (!cleared[1]) return { x: 46.8, y: 3.5 };
  if (!checkpoint?.intelSecured) return { x: 34.3, y: 3.5 };
  if (!cleared[0]) return { x: 53.2, y: 0 };
  return { x: 3.6, y: 0 };
}

export function restoreRaidCampaignCheckpoint(campaign, raw) {
  const checkpoint = normalizeRaidCampaignCheckpoint(raw);
  if (!campaign || !checkpoint) return null;
  campaign.enabled = true;
  campaign.stage = checkpoint.stage;
  campaign.announcedFloors = [...checkpoint.announcedFloors];
  campaign.intelSecured = checkpoint.intelSecured;
  campaign.elapsedSeconds = checkpoint.elapsedSeconds;
  campaign.completed = false;
  campaign.dialogueQueue.length = 0;
  campaign.activeDialogue = null;
  campaign.dialogueRemaining = 0;
  if (checkpoint.stage !== 'insertion') {
    const cleared = checkpoint.clearedFloors;
    const line = checkpoint.stage === 'extract'
      ? '进度已恢复。失联名单已经封存，地面入口的撤离信号还需要确认。'
      : checkpoint.intelSecured
        ? '进度已恢复。名单已回收；继续清理尚未肃清的楼层。'
        : cleared[1]
          ? '进度已恢复。二层守军已清理，回到 COMMS 机柜取回失联名单。'
          : cleared[2]
            ? '进度已恢复。屋顶与三层已肃清，继续向二层推进。'
            : cleared[3]
              ? '进度已恢复。屋顶已肃清，继续沿中央楼梯向下推进。'
              : '进度已恢复。绳降已经完成，屋顶守军仍是当前目标。';
    campaign.activeDialogue = { speaker: '指挥台 · 黑匣', text: line, duration: 5.8 };
    campaign.dialogueRemaining = 5.8;
  }
  return checkpoint;
}

export function getRaidObjective(campaign, clearedFloors = {}) {
  if (!campaign?.enabled) return '';
  if (campaign.completed || campaign.stage === 'complete') return '行动完成 · 失联名单已封存，记录已保存';
  if (campaign.stage === 'insertion') return '正在绳降 · 稳住姿态，准备进入屋顶';
  if (!clearedFloors[3]) return '目标 01/04 · 清理屋顶守军，找到中央楼梯入口';
  if (!clearedFloors[2]) return '目标 02/04 · 沿中央楼梯进入三层，清剿本层守军';
  if (!clearedFloors[1]) return '目标 03/04 · 清剿二层守军，调查 COMMS 机柜';
  if (!campaign.intelSecured) return '目标 03/04 · 按 E 回收 COMMS 终端中的失联名单';
  if (!clearedFloors[0]) return '目标 04/04 · 清理地面入口，确认撤离通路';
  return '返撤目标 · 返回地面入口配电柜旁，按 E 呼叫撤离';
}

export function updateRaidCampaign(campaign, dt, facts = {}) {
  if (!campaign || !facts.enabled) return campaign;
  campaign.enabled = true;
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (facts.playerAlive && !campaign.completed) campaign.elapsedSeconds += safeDt;

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
  if (allClear && campaign.intelSecured && campaign.stage !== 'extract' && campaign.stage !== 'complete') {
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

export function secureRaidIntel(campaign) {
  if (!campaign || !campaign.enabled || campaign.completed || campaign.intelSecured) return false;
  campaign.intelSecured = true;
  enqueue(campaign, INTEL_DIALOGUE);
  return true;
}

export function advanceRaidDialogue(campaign) {
  if (!campaign) return null;
  campaign.activeDialogue = null;
  campaign.dialogueRemaining = 0;
  return campaign;
}

export function completeRaidCampaign(campaign) {
  if (!campaign || !campaign.enabled || !campaign.intelSecured || campaign.stage !== 'extract' || campaign.completed) return false;
  campaign.completed = true;
  campaign.stage = 'complete';
  campaign.activeDialogue = null;
  campaign.dialogueRemaining = 0;
  campaign.dialogueQueue.length = 0;
  enqueue(campaign, EPILOGUE);
  campaign.activeDialogue = campaign.dialogueQueue.shift() || null;
  campaign.dialogueRemaining = campaign.activeDialogue?.duration || 0;
  return true;
}
