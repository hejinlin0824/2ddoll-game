import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAID_CAMPAIGN_SAVE_KEY,
  RAID_CAMPAIGN_TITLE,
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
