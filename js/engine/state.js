// ============================================
// state.js — 状态定义与序列化（纯 JSON，禁止 DOM）
// 属于 js/engine/：严禁 document / window / localStorage / DOM
// 3.0 迁移到 Python 时，本模块直接映射为 pydantic / SQLite 模型
// ============================================

(function (global) {
  'use strict';

  // ---- 常量（Phase 1：清朝段） ----
  const START_YEAR = 1845;              // 道光二十五年（1830–1860 锚点内）
  const TENURE_MONTHS = 36;             // 清流官三年一任（36 月）
  const PHASE1_CITIES = [
    { id: 'hankou',     name: '汉口',     nameEn: 'Hankou',     lat: 30.6, lng: 114.3, type: 'port',  role: '集散港' },
    { id: 'fancheng',   name: '樊城',     nameEn: 'Fancheng',   lat: 32.0, lng: 112.1, type: 'land',  role: '转运' },
    { id: 'sheqi',      name: '赊旗',     nameEn: 'Sheqi',      lat: 33.0, lng: 113.0, type: 'land',  role: '转运' },
    { id: 'taiyuan',    name: '太原',     nameEn: 'Taiyuan',    lat: 37.9, lng: 112.5, type: 'land',  role: '转运' },
    { id: 'zhangjiakou', name: '张家口',  nameEn: 'Kalgan',     lat: 40.8, lng: 114.9, type: 'border', role: '边关税关' },
    { id: 'kulun',      name: '库伦',     nameEn: 'Kulun (Urga)', lat: 47.9, lng: 106.9, type: 'border', role: '互市' },
    { id: 'kiakhta',    name: '恰克图',   nameEn: 'Kiakhta',    lat: 50.4, lng: 106.5, type: 'border', role: '中俄口岸' }
  ];

  // ---- 官缺候选池（清朝民族官缺，Phase 1 重点） ----
  const OFFICIAL_SEATS = [
    // 恰克图（满缺为主，边疆）
    { post: '恰克图办事司员', faction: '清·满', seat: '满缺', city: 'kiakhta',   level: 4 },
    { post: '管理商民事务司员', faction: '清·汉军旗', seat: '汉缺', city: 'kiakhta', level: 3 },
    // 库伦（满缺 + 蒙缺）
    { post: '钦差库伦办事大臣', faction: '清·满', seat: '满缺', city: 'kulun',     level: 5 },
    { post: '库伦帮办大臣', faction: '清·蒙', seat: '蒙缺', city: 'kulun',     level: 4 },
    // 张家口
    { post: '察哈尔都统', faction: '清·满', seat: '满缺', city: 'zhangjiakou', level: 5 },
    { post: '张家口同知', faction: '清·汉', seat: '汉缺', city: 'zhangjiakou', level: 3 },
    // 汉口（湖广总汇，汉缺为主）
    { post: '汉黄德道（江汉关道）', faction: '清·汉', seat: '汉缺', city: 'hankou', level: 4 }
  ];

  // 各族候选名池（符合民族命名习惯，非真实历史人物；池子够大 + pickName 查重保证在任者不重名）
  const CANDIDATE_POOL = {
    '清·满':    ['富察·讷尔经额', '爱新觉罗·舒明', '佟佳·荣禄', '瓜尔佳·额勒登保', '钮祜禄·德楞泰', '那拉·文祥',
               '赫舍里·英和', '乌雅·常清', '西林觉罗·恒福', '郭布罗·宝昌', '叶赫那拉·照连', '舒穆禄·续普'],
    '清·汉军旗': ['张廷玉', '王定安', '李海观', '赵秉文', '孙嘉淦', '刘统勋',
               '顾忠廉', '沈启荣', '唐稚之', '罗承彦', '裴行祖', '冯念祖'],
    '清·汉':    ['李鸿章', '王定安', '林则徐', '曾国藩', '左宗棠', '沈葆桢',
               '沈以正', '韩佩之', '邱梦锡', '杜守衡', '程茂先', '魏习之'],
    '清·蒙':    ['桑寨多尔济', '僧格林沁', '德木楚克', '那木济勒', '巴图蒙克', '绰克图',
               '巴尔珠尔', '策林多尔济', '罗布桑', '贡布扎布', '丹增诺布', '占巴道尔济']
  };

  // 生成式兜底名段（候选池被换官耗尽时组合取名，仍避开在任者）
  const GEN_PARTS = {
    '清·满':    { su: ['富察', '那拉', '瓜尔佳', '佟佳', '钮祜禄', '赫舍里', '乌雅', '郭布罗'], gv: ['德恵', '安宁', '常寿', '瑞祥', '嵩龄', '福成', '庆祥', '恒泰'], join: '·' },
    '清·汉军旗': { su: ['赵', '钱', '孙', '李', '周', '吴', '郑', '冯'], gv: ['永禧', '兆德', '崇文', '宽福', '贻安', '绶南', '谦良', '敦甫'], join: '' },
    '清·汉':    { su: ['沈', '韩', '邱', '杜', '程', '魏', '白', '顾'], gv: ['以正', '佩之', '梦锡', '守衡', '茂先', '习之', '嘉楠', '树青'], join: '' },
    '清·蒙':    { su: ['那木', '罗布', '丹增', '占巴', '贡布', '策林'], gv: ['多尔济', '桑布', '扎布', '道尔济', '诺尔布', '车凌'], join: '' }
  };

  // ---- 唯一取名：优先候选池未用者，池尽则生成式组合；绝不与 usedNames 重复 ----
  function pickName(faction, usedNames) {
    const used = usedNames instanceof Set ? usedNames : new Set(usedNames || []);
    const pool = CANDIDATE_POOL[faction] || CANDIDATE_POOL['清·汉'];
    const available = pool.filter(n => !used.has(n));
    if (available.length) return available[Math.floor(Math.random() * available.length)];
    return _genName(faction, used);
  }

  function _genName(faction, used) {
    const p = GEN_PARTS[faction] || GEN_PARTS['清·汉'];
    for (let i = 0; i < 100; i++) {
      const su = p.su[Math.floor(Math.random() * p.su.length)];
      const gv = p.gv[Math.floor(Math.random() * p.gv.length)];
      const name = p.join ? su + p.join + gv : su + gv;
      if (!used.has(name)) return name;
    }
    // 理论上到不了这（组合数远超在任人数）
    return p.join ? p.su[0] + p.join + '续荫' : p.su[0] + '续荫';
  }

  // ---- 亲族继任取名：沿用家族姓 + 谱名，避开在任者 ----
  function genRelativeName(oldName, usedNames) {
    const used = usedNames instanceof Set ? usedNames : new Set(usedNames || []);
    const hasDot = oldName.includes('·');
    const familySeg = oldName.split('·')[0];
    const givens = ['继业', '守成', '康年', '绍绪', '泽宗', '承宗', '广启', '嗣心'];
    for (let i = 0; i < givens.length; i++) {
      const gv = givens[Math.floor(Math.random() * givens.length)];
      const name = hasDot ? `${familySeg}·${gv}` : `${familySeg}${gv}`;
      if (!used.has(name)) return name;
    }
    return hasDot ? `${familySeg}·续荫` : `${familySeg}续荫`;
  }

  // ---- 核心状态工厂 ----

  function makeOfficial(seat, idx) {
    const pool = CANDIDATE_POOL[seat.faction] || CANDIDATE_POOL['清·汉'];
    return {
      id: `official_${seat.city}_${seat.seat}_${idx}`,
      name: pool[idx % pool.length],
      faction: seat.faction,
      seat: seat.seat,
      post: seat.post,
      city: seat.city,
      level: seat.level,
      // 私有状态
      wealth: 0,                    // 私囊（银两）
      politicalCapital: 50,         // 政治资本（0~100）
      tenureRemaining: TENURE_MONTHS,
      // 性格（0~1 归一）
      traits: {
        greed: rand(0.4, 0.95),
        riskAverse: rand(0.2, 0.9),
        loyalty: rand(0.2, 0.9),
        boldness: rand(0.2, 0.9)
      },
      // 目标权重（自私核心：财富/资本/家族/安全 − 风险）
      utilityWeights: {
        wealth: 0.9, capital: 0.5, family: 0.6, safety: 0.3, risk: 0.4
      },
      relationships: [],             // 上下级/亲属/商人
      privateMemory: '',             // 长期目标/恩怨（AI 生成）
      // 决策产物
      lastAction: null,              // 本月动作（加税/克扣/贿赂/安插亲戚/勾结）
      exposed: false                 // 贪腐是否暴露
    };
  }

  function makeMerchant(origin, idx) {
    return {
      id: `merchant_${origin}_${idx}`,
      name: merchantName(origin, idx),
      origin,                        // 晋商 / 俄商 / 希腊商 ...
      capital: rand(500, 3000),      // 本金（银两）
      goods: ['茶叶'],               // Phase 1 仅茶叶
      route: null,                   // 当前路线 id 序列
      loyalty: null,                 // 依附的官员 id
      network: [],                   // 靠山/联系人
      isAI: false,                   // 是否 AI 代表商人
      traits: {
        riskAverse: rand(0.3, 0.9),
        mobility: rand(0.3, 0.9),
        loyalty: rand(0.2, 0.8)
      }
    };
  }

  function merchantName(origin, idx) {
    const names = {
      '晋商': ['乔致庸', '常万达', '渠本翘', '曹三喜', '雷履泰', '王相卿'],
      '俄商': ['伊万·库兹涅佐夫', '彼得·斯米尔诺夫', '尼古拉·沃尔科夫', '瓦西里·波波夫'],
      '希腊商': ['乔治·帕帕多普洛斯', '康斯坦丁·马夫罗迪', '迪米特里·安格洛斯'],
      '意大利商': ['安东尼奥·罗西', '路易吉·费拉里', '乔瓦尼·科伦坡']
    };
    const pool = names[origin] || names['晋商'];
    return pool[idx % pool.length];
  }

  function makeInitialState(config = {}) {
    const officials = [];
    const usedCityCount = {};
    const usedNames = new Set();          // 在任者姓名查重（硬性要求：不重名）
    OFFICIAL_SEATS.forEach((seat) => {
      const cityIdx = usedCityCount[seat.city] || 0;
      usedCityCount[seat.city] = cityIdx + 1;
      const o = makeOfficial(seat, cityIdx);
      // 池内按 idx 取名会撞（同城同民族多缺时 idx 相同）→ 换未用名
      if (usedNames.has(o.name)) o.name = pickName(seat.faction, usedNames);
      usedNames.add(o.name);
      officials.push(o);
    });

    // 商人：3 家晋商 + 1 家俄商（Phase 1），其中 1 家晋商为 AI 代表
    const merchants = [];
    const merchantSpecs = [
      { origin: '晋商', ai: true },
      { origin: '晋商', ai: false },
      { origin: '晋商', ai: false },
      { origin: '俄商', ai: false }
    ];
    merchantSpecs.forEach((spec, i) => {
      const m = makeMerchant(spec.origin, i);
      m.isAI = spec.ai;
      merchants.push(m);
    });

    return {
      meta: {
        version: '2.0-phase1',
        year: config.startYear || START_YEAR,
        month: 1,                      // 1~12
        monthIndex: 1,                 // 累计月数（第 1 月起；推进后为 2）
        reignName: '道光',
        turn: 1
      },
      cities: PHASE1_CITIES,
      officials,
      merchants,
      tradeLine: {
        routes: makeRoutes(),
        totalVolume: 100,              // 基准贸易量（单位：担/月）
        volumeByRoute: {},             // 各路线贸易量占比
        taxRateByCity: {}              // 各城实际税率（制度 + 官员加成）
      },
      metrics: {
        officialWealth: [],            // 官员财富时序
        tradeHealth: [],               // 贸易量时序
        corruptionIndex: [],           // 腐败指数时序
        routeMigration: []             // 陆路 vs 海路占比时序
      },
      eventLog: [],
      params: {
        taxRateCap: config.taxRateCap || 0.30,     // 税率上限（可调参数）
        merchantCount: config.merchantCount || 4,
        aiMerchantEnabled: true,
        officialAIMode: 'ai'           // 'ai' | 'rule'
      }
    };
  }

  // ---- 路线定义（陆路主线，Phase 1 可串通） ----
  function makeRoutes() {
    return [
      { id: 'land_main', name: '北运陆路主线', type: 'land',
        path: ['hankou', 'fancheng', 'sheqi', 'taiyuan', 'zhangjiakou', 'kulun', 'kiakhta'],
        baseCost: 10, baseRisk: 0.2, baseTime: 6 },
      { id: 'land_alt', name: '陆路支线（避税绕行）', type: 'land',
        path: ['hankou', 'fancheng', 'sheqi', 'taiyuan', 'zhangjiakou', 'kulun', 'kiakhta'],
        baseCost: 13, baseRisk: 0.35, baseTime: 8,
        note: '走私/绕卡小路，成本与风险更高，但可绕开部分税关' }
    ];
  }

  // ---- 序列化接口（engine 内唯一的持久化出入口） ----
  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(raw) {
    return JSON.parse(raw);
  }

  // 供宿主（ui/app）注入存储适配器，engine 自身不碰 localStorage
  let storageAdapter = null;
  function setStorage(adapter) {
    storageAdapter = adapter; // { load(), save(str) }
  }
  function persist(state) {
    if (storageAdapter) storageAdapter.save(serialize(state));
  }
  function restore() {
    if (storageAdapter) {
      const raw = storageAdapter.load();
      if (raw) {
        const s = deserialize(raw);
        // 旧档迁移：2.0 早期版本 monthIndex 从 0 起（第 0 月），第一次推进仍显示 1 月（卡一月 bug）
        // 统一迁移为从 1 起
        if (s.meta && s.meta.monthIndex === 0) {
          s.meta.monthIndex = 1;
        }
        // 旧档迁移：姓名查重修复前保存的档可能含重名官员，就地改掉后来者
        if (Array.isArray(s.officials)) {
          const used = new Set();
          s.officials.forEach((o) => {
            if (used.has(o.name)) {
              o.name = pickName(o.faction, used);
            }
            used.add(o.name);
          });
        }
        return s;
      }
    }
    return null;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  global.CKUState = {
    START_YEAR, TENURE_MONTHS, PHASE1_CITIES, OFFICIAL_SEATS, CANDIDATE_POOL,
    makeInitialState, makeOfficial, makeMerchant,
    pickName, genRelativeName,
    serialize, deserialize, setStorage, persist, restore
  };

})(typeof window !== 'undefined' ? window : globalThis);
