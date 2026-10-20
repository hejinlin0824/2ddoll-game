// 波次兵种编排：纯数据函数，不依赖物理引擎，便于独立测试与后续平衡。
// role: rifleman(标准中距离) | rusher(快速贴近) | support(远距压制) | veteran(高耐久精英)
export function composeWaveRoles(wave, count, rule = {}) {
  const roles = Array(Math.max(0, count)).fill('rifleman');
  if (count <= 0) return roles;
  const put = (i, role) => { roles[((i % count) + count) % count] = role; };

  if (wave >= 2 && count >= 3) put(wave + 1, 'rusher');
  if (wave >= 4 && count >= 4) put(wave + 2, 'support');
  if (wave >= 6 && wave % 3 === 0 && count >= 4) put(0, 'veteran');
  if (wave >= 10 && count >= 6) put(count - 2, 'veteran');

  // 地图不是只换背景：相同波次在不同地形采用不同兵种比例。
  if (rule.roleBias === 'overwatch' && count >= 3) put(1, 'support');
  if (rule.roleBias === 'breach' && count >= 3) put(0, 'rusher');
  if (rule.roleBias === 'swarm' && count >= 4) {
    put(count - 1, 'rusher');
    if (count >= 7) put(count - 3, 'rusher');
  }
  if (rule.roleBias === 'skirmish' && count >= 4) {
    put(wave + 2, 'rusher');
    if (wave >= 5 && count >= 6) put(wave + 4, 'support');
  }
  if (wave === (rule.maxWave ?? 15) && count >= 2) {
    put(0, 'veteran');
    put(count - 1, 'rusher');
  }
  return roles;
}
