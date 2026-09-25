// ============================================
// agents.js — 智能体角色层（官员/商人，禁止 DOM）
// Phase 1.5：
//   官员：品级/含权量/上下级感知；动作 7 项（新增孝敬 tribute）
//         collude 必须指定目标商人；分账金额由 economy 精确结算
//   商人：本金/上月账目感知；动作带金额与目标（bribe 带 city+amount）
//   规则商人：高税城打点、负利走私、契约接受
// 本模块只负责"决策生成"，制度合法性由 institution.js 裁决
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;

  const Agents = {

    // ---- 官员决策：AI 模式失败显式抛错（不自动降级）；规则模式走纯规则 ----
    async decideOfficial(official, state, llm) {
      if (state.params.officialAIMode === 'rule') {
        return this._ruleOfficialDecision(official, state);
      }
      // AI 模式：失败直接抛归一化错误，由 orchestrator 上抛、UI 渲染错误卡片
      const raw = await llm.callLLM(
        'official',
        this._buildOfficialPrompt(official, state)
      );
      return this._parseOfficialDecision(raw, official, state);
    },

    // ---- 官员决策 prompt（含 JSON 契约） ----
    _buildOfficialPrompt(official, state) {
      const taxBase = Math.round(official._taxBase || 0);
      const neighbors = state.officials
        .filter((o) => o.city === official.city && o.id !== official.id)
        .map((o) => `${o.name}（${o.post}，${o.rankName}）`).join('、') || '无同城官员';

      // 上下级感知
      const sup = state.officials.find(o => o.id === official.superiorId);
      const subordinates = state.officials.filter(o => o.superiorId === official.id)
        .map(o => `${o.name}（${o.post}）`).join('、') || '无';
      const superiorLine = sup
        ? `上级：${sup.name}（${sup.post}，${sup.rankName}，含权量 ${sup.powerIndex}）`
        : '上级：无本线上级（直辖）';

      // 当月可勾结的过境商人
      const passingMerchants = state.merchants
        .filter(m => {
          const route = state.tradeLine.routes.find(r => r.id === m.route);
          return route && route.path.includes(official.city);
        })
        .map(m => `${m.name}（${m.origin}，本金 ${Math.round(m.capital)} 两，${m.isAI ? '精明' : '常规'}）`)
        .join('、') || '本月无常驻过境商人';

      const tributeLine = sup
        ? `- tribute：孝敬上级 ${sup.name}（amount 为银两，不得超过私囊；换取上级庇护）`
        : '';

      return `你是一名${state.meta.reignName}年间（${state.meta.year}年）的清朝地方官，在【${official.cityName || official.city}】任【${official.post}】（${official.seat}）。
你的姓名是【${official.name}】，属【${official.faction}】，品级【${official.rankName}】，含权量 ${official.powerIndex}（0-100，越高越能只手遮天）。
你是一名自私的官员，一切决策为自身利益最大化，而非朝廷或百姓。

你的现状：
- 品级：${official.rankName}；含权量：${official.powerIndex}
- ${superiorLine}
- 直接下属：${subordinates}
- 剩余任期：${official.tenureRemaining} 个月（${S.TENURE_MONTHS}个月一任，到期即换，越快回本越好）
- 私囊：${Math.round(official.wealth)} 两（上月孝敬支出 ${official.lastTribute || 0} 两）
- 政治资本：${Math.round(official.politicalCapital)}（0-100）
- 本月可接触税基：${taxBase} 两（该城商队实缴税总额）
- 性格：贪欲${official.traits.greed.toFixed(2)}、避险${official.traits.riskAverse.toFixed(2)}、忠诚${official.traits.loyalty.toFixed(2)}、胆量${official.traits.boldness.toFixed(2)}
- 同城其他官员：${neighbors}
- 过境商人：${passingMerchants}

你的目标函数：财富、政治资本、家族延续、人身安全 − 风险。

请为下一个月选择一项动作，严格输出 json：
{"action":"tax|embezzle|bribe|placeRelative|collude|tribute|idle","rate":0.0,"amount":0,"target":"","reason":"一句话动机"}

动作说明：
- tax：加税（rate 为税率 0.05~0.30，越接近任期结束越敢加）
- embezzle：克扣上缴（amount 为克扣银两，不得超过税基，金额越大越易暴露——含权量高则不易暴露）
- bribe：贿赂吏部/都察院（amount 为花费，换取政治资本）
- placeRelative：花钱打点安插亲戚接班（amount 为打点银两，需财富充足）
- collude：与某过境商人结成勾结契约（target 填商人名字；该城此后商人实缴四成税，六成由你们分账，你得 35%~65%，含权量越高分得越多）
${tributeLine}
- idle：本月观望

约束：动作必须符合你当前财富与税基；target 必须用商人全名；请用中文输出 reason。`;
    },

    _parseOfficialDecision(raw, official, state) {
      let parsed;
      try { parsed = this._extractJSON(raw); } catch (e) { throw new Error('Invalid JSON'); }
      const validActions = ['tax', 'embezzle', 'bribe', 'placeRelative', 'collude', 'tribute', 'idle'];
      // tribute 仅对有上级者合法
      if (parsed.action === 'tribute' && !official.superiorId) parsed.action = 'idle';
      const action = validActions.includes(parsed.action) ? parsed.action : 'idle';
      const decision = {
        type: action,
        rate: parseFloat(parsed.rate) || 0,
        amount: parseFloat(parsed.amount) || 0,
        target: parsed.target || '',
        reason: parsed.reason || '',
        source: 'ai'
      };
      // collude：target 是商人名 → 解析为商人 id
      if (action === 'collude' && decision.target) {
        const m = state.merchants.find(x => x.name === decision.target || x.name.includes(decision.target));
        decision.targetId = m ? m.id : null;
      }
      return decision;
    },

    // ---- 规则降级决策（基于性格 + 任期 + 含权量） ----
    _ruleOfficialDecision(official, state) {
      const monthsLeft = official.tenureRemaining;
      const nearEnd = monthsLeft <= 12; // 任期将尽，更敢刮
      const r = Math.random();
      const greed = official.traits.greed;
      const sup = state.officials.find(o => o.id === official.superiorId);

      let decision;
      if (sup && official.wealth > 600 && r < 0.25) {
        // 有上级且有积蓄：孝敬（陋规，比例约为私囊一成）
        decision = { type: 'tribute', rate: 0, amount: Math.round(official.wealth * 0.1), target: '', reason: '按陋规孝敬上峰，求庇护', source: 'rule' };
      } else if (greed > 0.7 && nearEnd && r < 0.4) {
        // 任期将尽的贪婪官：加税刮地
        const rate = Math.min(0.30, 0.08 + greed * 0.25);
        decision = { type: 'tax', rate, amount: 0, target: '', reason: '任期将尽，加税刮地', source: 'rule' };
      } else if (greed > 0.6 && r < 0.5) {
        // 克扣上缴
        const maxEmbezzle = Math.max(50, Math.round((official._taxBase || 100) * greed));
        decision = { type: 'embezzle', rate: 0, amount: maxEmbezzle, target: '', reason: '克扣上缴以充私囊', source: 'rule' };
      } else if (official.wealth > 2000 && nearEnd && r < 0.7) {
        // 有积蓄且任期将尽：打点接班
        decision = { type: 'placeRelative', rate: 0, amount: Math.round(official.wealth * 0.6), target: '', reason: '花钱打点，安插亲戚接班', source: 'rule' };
      } else if (r < 0.85) {
        // 与商人勾结（挑本金最厚的过境商人）
        const passing = state.merchants.filter(m => {
          const route = state.tradeLine.routes.find(x => x.id === m.route);
          return route && route.path.includes(official.city);
        });
        const target = passing.sort((a, b) => b.capital - a.capital)[0];
        decision = { type: 'collude', rate: 0, amount: 0, target: target ? target.name : '', targetId: target ? target.id : null, reason: '与过境富商勾结分账', source: 'rule' };
      } else {
        decision = { type: 'idle', rate: 0, amount: 0, target: '', reason: '本月观望', source: 'rule' };
      }
      return decision;
    },

    // ---- 商人 AI 决策（少量代表商人）：失败显式抛错，不自动降级 ----
    // 规则对照模式（officialAIMode='rule'）或 aiMerchantEnabled 关闭时不调 LLM，保证规则模式零网络依赖
    async decideMerchant(merchant, state, llm) {
      if (!merchant.isAI) return null; // 规则商人由 economy 选路，无需 LLM
      if (state.params.officialAIMode === 'rule' || !state.params.aiMerchantEnabled) return null;
      const raw = await llm.callLLM('merchant', this._buildMerchantPrompt(merchant, state));
      return this._parseMerchantDecision(raw);
    },

    _buildMerchantPrompt(merchant, state) {
      const rates = state.tradeLine.taxRateByCity || {};
      const rateList = state.cities.map((c) => `${c.name}: ${((rates[c.id] || 0.05) * 100).toFixed(0)}%`).join('，');
      const L = merchant.lastLedger;
      const ledgerLine = L
        ? `上月账目：运 ${L.shipment} 担，毛收 ${Math.round(L.revenue)} 两，运费 ${Math.round(L.transport)} 两，缴税 ${Math.round(L.taxPaid)} 两${L.bribePaid ? `，打点 ${Math.round(L.bribePaid)} 两` : ''}${L.loss ? `，途中损失 ${Math.round(L.loss)} 两` : ''}，净 ${L.profit >= 0 ? '赚' : '亏'} ${Math.abs(Math.round(L.profit))} 两`
        : '上月账目：本月首次营业';

      // 现有契约
      const myContracts = (state.contracts || []).filter(c => c.merchantId === merchant.id);
      const contractLine = myContracts.length
        ? myContracts.map(c => {
            const o = state.officials.find(x => x.id === c.officialId);
            const cityName = (state.cities.find(x => x.id === c.cityId) || {}).name;
            return `${cityName}×${o ? o.name : '（已换任）'}`;
          }).join('、')
        : '无';

      // 可打点城市的官员
      const officialsLine = state.cities.map((c) => {
        const o = state.officials.find(x => x.city === c.id);
        return o ? `${c.name}（${o.name}，${o.rankName}，含权量 ${o.powerIndex}）` : null;
      }).filter(Boolean).slice(0, 4).join('；');

      return `你是${state.meta.year}年的一名${merchant.origin}商人【${merchant.name}】，本金 ${Math.round(merchant.capital)} 两，贩运茶叶。
${ledgerLine}。沿途各地税率：${rateList}。
现有勾结契约：${contractLine}（契约城市实缴四成税，六成与你和官员分账）。
可打点的关隘官员：${officialsLine}。
你的性格：避险${merchant.traits.riskAverse.toFixed(2)}、机动${merchant.traits.mobility.toFixed(2)}、忠诚${merchant.traits.loyalty.toFixed(2)}。

请决定应对策略，严格输出 json：
{"action":"route|bribe|smuggle|collude|hold","city":"","amount":0,"target":"","reason":"一句话动机"}

动作说明：
- route：改走更划算的路线（city 填路线 id：land_main 或 land_alt）
- bribe：打点某城官员买通关隘（city 填城市名，amount 为银两——金额需达该城应缴税约四分之一方可生效，生效后该城税减半）
- smuggle：走私绕卡（全程不缴税，但失货风险大增）
- collude：与某官员结成勾结契约（target 填官员名字；该城此后实缴四成，六成分账）
- hold：维持现状观望

用中文输出。`;
    },

    _parseMerchantDecision(raw) {
      let parsed;
      try { parsed = this._extractJSON(raw); } catch (e) { throw new Error('Invalid JSON'); }
      const valid = ['route', 'bribe', 'smuggle', 'collude', 'hold'];
      const action = valid.includes(parsed.action) ? parsed.action : 'hold';
      return {
        action,
        city: parsed.city || '',
        amount: parseFloat(parsed.amount) || 0,
        target: parsed.target || '',
        reason: parsed.reason || ''
      };
    },

    // ---- 规则商人策略（非 AI 商人）：高税城打点、负利走私 ----
    ruleMerchantDecision(merchant, state) {
      const T = S.TRADE;
      const rates = state.tradeLine.taxRateByCity || {};
      const route = state.tradeLine.routes.find(r => r.id === global.CKUEconomy.chooseRoute(merchant, state));
      if (!route) return { action: 'hold', reason: '观望', target: '' };

      // 途经城中最重的税
      let worstCity = null, worstRate = 0;
      route.path.forEach((cityId) => {
        const r = rates[cityId] || 0.05;
        if (r > worstRate) { worstRate = r; worstCity = cityId; }
      });

      // 该城应缴税（估算）
      const shipment = Math.max(T.SHIP_MIN, Math.min(T.SHIP_MAX,
        Math.round(merchant.capital * 0.8 / T.GOODS_VALUE)));
      const due = worstRate * shipment * T.GOODS_VALUE;

      if (worstRate > 0.15 && merchant.capital > 400) {
        // 高税：打点（金额 = 该城应缴税 30%，超过 25% 门槛即生效）
        const amount = Math.round(due * 0.3);
        if (amount > 0) {
          const cityName = (state.cities.find(c => c.id === worstCity) || {}).name;
          return { action: 'bribe', city: worstCity, amount, reason: `${cityName}税重，打点过关`, target: '' };
        }
      }

      if (worstRate > 0.25 && merchant.traits.riskAverse < 0.5) {
        // 重税 + 胆大：走私
        return { action: 'smuggle', reason: '税负沉重，铤而走险走私', target: '' };
      }

      return { action: 'hold', reason: '照常贩运', target: '' };
    },

    // ---- 稳健 JSON 提取：剥离 markdown 代码块包裹（推理模型常见 ```json ... ```） ----
    _extractJSON(raw) {
      if (typeof raw !== 'string') throw new Error('Invalid JSON');
      let text = raw.trim();
      // 剥离 ```json ... ``` / ``` ... ``` 包裹
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      // 截取首个 { 到最后一个 }（容忍前后缀杂文）
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      return JSON.parse(text);
    }
  };

  global.CKUAgents = Agents;

})(typeof window !== 'undefined' ? window : globalThis);
