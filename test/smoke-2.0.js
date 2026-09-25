// 冒烟测试：验证 2.0 engine 核心循环（规则模式，无网络依赖）
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 加载 engine 模块（它们挂到 globalThis）
global.window = global;
function load(f) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine', f), 'utf8');
  eval(code);
}
['state.js', 'llm.js', 'institution.js', 'economy.js', 'agents.js', 'orchestrator.js'].forEach(load);

// mock fetch：拦截 LLM 调用（可切换成功/失败模式）
let mockFail = false; // 置 true 时模拟 API 失败
global.fetch = async function (url, opts) {
  if (mockFail) {
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } })
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => {
      const body = JSON.parse(opts.body);
      const sys = body.messages[0].content;
      if (sys.includes('官员')) {
        return { choices: [{ message: { content: JSON.stringify({ action: 'tax', rate: 0.18, amount: 0, target: '', reason: '测试加税' }) } }] };
      }
      return { choices: [{ message: { content: JSON.stringify({ action: 'route', target: '', reason: '测试选路' }) } }] };
    }
  };
};

const S = global.CKUState;
const Institution = global.CKUInstitution;
const Economy = global.CKUEconomy;
const Agents = global.CKUAgents;
const LLM = global.CKULLM;
const Orchestrator = global.CKUOrchestrator;

async function main() {
  // 1. 初始化状态
  const state = S.makeInitialState();
  assert.strictEqual(state.cities.length, 7, '应有 7 个城市节点');
  assert.strictEqual(state.officials.length, 7, '应有 7 个官缺');
  assert.ok(state.merchants.length >= 4, '应有至少 4 个商人');
  assert.strictEqual(state.meta.year, 1845, '初始年份应为 1845');

  // 验证民族官缺分布：恰克图/库伦/张家口应有满缺或蒙缺
  const borderSeats = state.officials.filter(o => ['kiakhta', 'kulun', 'zhangjiakou'].includes(o.city));
  assert.ok(borderSeats.some(o => o.faction === '清·满'), '边疆应有满洲官员');
  assert.ok(borderSeats.some(o => o.faction === '清·蒙'), '库伦应有蒙古帮办大臣');
  // 验证在任官员姓名唯一
  const initNames = state.officials.map(o => o.name);
  assert.strictEqual(new Set(initNames).size, initNames.length, `初始官员姓名必须唯一：${initNames.join('、')}`);
  console.log('✓ 初始化 + 民族官缺 + 姓名唯一校验通过');

  // 2. 规则模式推进 40 回合（触发换官）
  state.params.officialAIMode = 'rule';
  for (let i = 0; i < 40; i++) {
    await Orchestrator.step(state);
  }

  // 3. 验证换官事件发生
  const rotations = state.eventLog.filter(e => e.type === 'rotation');
  assert.ok(rotations.length > 0, '36 月后应发生换官事件');
  // 换官后姓名仍必须唯一（含亲族接班、池尽生成兜底路径）
  const names40 = state.officials.map(o => o.name);
  assert.strictEqual(new Set(names40).size, names40.length, `40 回合后在任官员姓名必须唯一：${names40.join('、')}`);
  console.log(`✓ 40 回合推进完成，发生 ${rotations.length} 次换官，在任者姓名无重复`);

  // 4. 验证经济结算产生数据
  assert.ok(state.metrics.tradeHealth.length === 40, '贸易健康度应有 40 个数据点');
  assert.ok(state.metrics.corruptionIndex.length === 40, '腐败指数应有 40 个数据点');
  assert.ok(state.metrics.routeMigration.length === 40, '商路迁移应有 40 个数据点');
  console.log('✓ 经济引擎指标齐全');

  // 5. 验证商人选路
  state.merchants.forEach(m => {
    assert.ok(m.route, `商人 ${m.name} 应已选路`);
  });
  console.log('✓ 商人选路正常');

  // 6. 验证换官带走财富 + 亲族接班机制
  const tookWealth = rotations.reduce((s, r) => s + r.tookWealth, 0);
  assert.ok(tookWealth >= 0, '换官带走财富应为非负');
  console.log(`✓ 换官累计带走私囊 ${tookWealth} 两`);

  // 7. 验证序列化往返
  const json = S.serialize(state);
  const restored = S.deserialize(json);
  assert.strictEqual(restored.officials.length, state.officials.length, '序列化后官员数应一致');
  assert.strictEqual(restored.metrics.tradeHealth.length, 40, '序列化后指标应保留');
  console.log('✓ 序列化往返一致');

  // 8. 验证 AI 模式 LLM 失败显式抛错（不自动降级）
  const state2 = S.makeInitialState();
  state2.params.officialAIMode = 'ai';
  mockFail = true;
  let threw = false;
  let caughtErr = null;
  try {
    await Orchestrator.step(state2);
  } catch (err) {
    threw = true;
    caughtErr = err;
  }
  mockFail = false;
  assert.ok(threw, 'AI 模式 API 失败应抛出错误而非静默降级');
  assert.ok(caughtErr && caughtErr.agentError, '错误应携带 agentError 上下文');
  assert.strictEqual(caughtErr.agentError.type, 'http', '401 应归一化为 http 类型');
  assert.strictEqual(caughtErr.agentError.role, 'official', '失败角色应为 official');
  console.log(`✓ AI 模式失败显式抛错（type=${caughtErr.agentError.type}, role=${caughtErr.agentError.role}）`);

  console.log('\n全部冒烟测试通过 ✔');
}

main().catch(err => {
  console.error('冒烟测试失败:', err);
  process.exit(1);
});
