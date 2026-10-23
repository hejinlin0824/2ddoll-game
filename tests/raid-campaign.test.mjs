import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAID_CAMPAIGN_CHECKPOINT_KEY,
  RAID_CAMPAIGN_SAVE_KEY,
  RAID_CAMPAIGN_TITLE,
  createRaidCampaignCheckpoint,
  getRaidCampaignResumeSpawn,
  normalizeRaidCampaignCheckpoint,
  restoreRaidCampaignCheckpoint,
  createRaidCampaignState,
  updateRaidCampaign,
  getRaidObjective,
  advanceRaidDialogue,
  secureRaidIntel,
  completeRaidCampaign,
} from '../src/game/domain/raidCampaign.js';

test('campaign starts with a roof objective and does not narrate before insertion ends', () => {
  const state = createRaidCampaignState(true);
  assert.equal(state.stage, 'insertion');
  assert.match(getRaidObjective(state), /绳降/);
  updateRaidCampaign(state, 1, { enabled: true, rappelDone: false, playerAlive: true });
  assert.equal(state.activeDialogue, null);
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true });
  assert.equal(state.stage, 'assault');
  assert.equal(state.activeDialogue.speaker, '指挥台 · 黑匣');
  assert.match(state.activeDialogue.text, /失联名单/);
});

test('floors clear from roof to ground, with no false completion before extraction', () => {
  const state = createRaidCampaignState(true);
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true });
  const cleared = {};
  for (const floorId of [3, 2, 1]) {
    cleared[floorId] = true;
    updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true, clearedFloors: cleared });
    assert.notEqual(state.stage, 'complete');
    assert.ok(state.announcedFloors.includes(floorId));
  }
  assert.match(getRaidObjective(state, cleared), /回收 COMMS 终端/);
  cleared[0] = true;
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true, clearedFloors: cleared });
  assert.equal(state.stage, 'assault', 'all floors alone must not skip evidence recovery');
  assert.equal(completeRaidCampaign(state), false, 'extraction must remain locked until the intel is recovered');
  assert.equal(secureRaidIntel(state), true);
  assert.equal(secureRaidIntel(state), false, 'the same evidence cannot be collected twice');
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true, clearedFloors: cleared });
  assert.equal(state.stage, 'extract');
  assert.match(getRaidObjective(state, cleared), /按 E 呼叫撤离/);
  assert.equal(completeRaidCampaign(state), true);
  assert.equal(state.stage, 'complete');
  assert.match(getRaidObjective(state, cleared), /记录已保存/);
  assert.equal(state.intelSecured, true);
  assert.match(state.activeDialogue.text, /正在离开建筑/);
});

test('dialogue can be dismissed and extraction cannot be completed early', () => {
  const state = createRaidCampaignState(true);
  assert.equal(completeRaidCampaign(state), false);
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true });
  const first = state.activeDialogue.text;
  advanceRaidDialogue(state);
  updateRaidCampaign(state, 0.1, { enabled: true, rappelDone: true, playerAlive: true });
  assert.notEqual(state.activeDialogue.text, first);
});

test('campaign identifies its persistent record key and chapter title', () => {
  assert.equal(RAID_CAMPAIGN_SAVE_KEY, 'contra-raid-campaign-v1');
  assert.match(RAID_CAMPAIGN_TITLE, /失联名单/);
});


test('campaign checkpoint resumes the next objective and preserves cleared floors', () => {
  const campaign = createRaidCampaignState(true);
  campaign.stage = 'assault';
  campaign.announcedFloors = [3, 2];
  campaign.elapsedSeconds = 47.8;
  const checkpoint = createRaidCampaignCheckpoint(campaign, { 3: true, 2: true, 1: false, 0: false });
  assert.equal(checkpoint.stage, 'assault');
  assert.deepEqual(checkpoint.announcedFloors, [3, 2]);
  assert.equal(checkpoint.elapsedSeconds, 47.8);
  assert.deepEqual(getRaidCampaignResumeSpawn(checkpoint), { x: 46.5, y: 3.5 });

  const restored = createRaidCampaignState(true);
  const result = restoreRaidCampaignCheckpoint(restored, checkpoint);
  assert.equal(result.clearedFloors[3], true);
  assert.equal(result.clearedFloors[2], true);
  assert.equal(result.clearedFloors[1], false);
  assert.equal(restored.stage, 'assault');
  assert.deepEqual(restored.announcedFloors, [3, 2]);
  assert.equal(restored.elapsedSeconds, 47.8);
  assert.match(restored.activeDialogue.text, /屋顶与三层已肃清/);
  assert.match(getRaidObjective(restored, result.clearedFloors), /清剿二层/);
});

test('checkpoint resumes at evidence or extraction controls and rejects malformed data', () => {
  const evidence = normalizeRaidCampaignCheckpoint({
    version: 1, campaign: RAID_CAMPAIGN_TITLE, stage: 'assault',
    clearedFloors: { 3: true, 2: true, 1: true, 0: true }, intelSecured: false, elapsedSeconds: 99,
  });
  assert.equal(evidence.stage, 'assault');
  assert.deepEqual(getRaidCampaignResumeSpawn(evidence), { x: 34.3, y: 3.5 });

  const extract = normalizeRaidCampaignCheckpoint({
    version: 1, campaign: RAID_CAMPAIGN_TITLE, stage: 'assault',
    clearedFloors: { 3: true, 2: true, 1: true, 0: true }, intelSecured: true, elapsedSeconds: 120,
  });
  assert.equal(extract.stage, 'extract');
  assert.deepEqual(getRaidCampaignResumeSpawn(extract), { x: 3.6, y: 0 });
  assert.equal(RAID_CAMPAIGN_CHECKPOINT_KEY, 'contra-raid-checkpoint-v1');
  assert.equal(normalizeRaidCampaignCheckpoint({ ...extract, campaign: 'wrong' }), null);
  assert.equal(normalizeRaidCampaignCheckpoint({ ...extract, version: 99 }), null);
  assert.equal(createRaidCampaignCheckpoint({ ...createRaidCampaignState(true), completed: true }, {}), null);
});
