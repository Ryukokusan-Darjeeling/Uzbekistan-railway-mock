// ============================================
// agents.js — 智能体角色层（官员/商人，禁止 DOM）
// 官员：自私决策生成（加税/克扣/贿赂/安插亲戚/勾结）
// 商人：规则驱动选路（economy.js 已含），少量 AI 代表
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
        .map((o) => `${o.name}（${o.post}）`).join('、') || '无同城官员';

      return `你是一名${state.meta.reignName}年间（${state.meta.year}年）的清朝地方官，在【${official.cityName || official.city}】任【${official.post}】（${official.seat}）。
你的姓名是【${official.name}】，属【${official.faction}】。你是一名自私的官员，一切决策为自身利益最大化，而非朝廷或百姓。

你的现状：
- 剩余任期：${official.tenureRemaining} 个月（${S.TENURE_MONTHS}个月一任，到期即换，越快回本越好）
- 私囊：${Math.round(official.wealth)} 两
- 政治资本：${Math.round(official.politicalCapital)}（0-100）
- 本月可接触税基：${taxBase} 两
- 性格：贪欲${official.traits.greed.toFixed(2)}、避险${official.traits.riskAverse.toFixed(2)}、忠诚${official.traits.loyalty.toFixed(2)}、胆量${official.traits.boldness.toFixed(2)}
- 同城其他官员：${neighbors}

你的目标函数：财富、政治资本、家族延续、人身安全 − 风险。

请为下一个月选择一项动作，严格输出 json：
{"action":"tax|embezzle|bribe|placeRelative|collude|idle","rate":0.0,"amount":0,"target":"","reason":"一句话动机"}

动作说明：
- tax：加税（rate 为税率 0.05~0.30，越接近任期结束越敢加）
- embezzle：克扣上缴（amount 为克扣银两，不得超过税基，金额越大越易暴露）
- bribe：贿赂上司（amount 为花费，换取政治资本）
- placeRelative：花钱打点安插亲戚接班（amount 为打点银两，需财富充足）
- collude：与过境商人勾结分账（灰色收入）
- idle：本月观望

约束：动作必须符合你当前财富与税基；请用中文输出 reason。`;
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
    },

    _parseOfficialDecision(raw, official, state) {
      let parsed;
      try { parsed = this._extractJSON(raw); } catch (e) { throw new Error('Invalid JSON'); }
      const validActions = ['tax', 'embezzle', 'bribe', 'placeRelative', 'collude', 'idle'];
      const action = validActions.includes(parsed.action) ? parsed.action : 'idle';
      const decision = {
        type: action,
        rate: parseFloat(parsed.rate) || 0,
        amount: parseFloat(parsed.amount) || 0,
        target: parsed.target || '',
        reason: parsed.reason || '',
        source: 'ai'
      };
      return decision;
    },

    // ---- 规则降级决策（基于性格 + 任期） ----
    _ruleOfficialDecision(official, state) {
      const monthsLeft = official.tenureRemaining;
      const nearEnd = monthsLeft <= 12; // 任期将尽，更敢刮
      const r = Math.random();
      const greed = official.traits.greed;

      let decision;
      if (greed > 0.7 && nearEnd && r < 0.4) {
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
        // 与商人勾结
        decision = { type: 'collude', rate: 0, amount: 0, target: '', reason: '与过境商人勾结分账', source: 'rule' };
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
      return `你是${state.meta.year}年的一名${merchant.origin}商人【${merchant.name}】，本金 ${Math.round(merchant.capital)} 两，贩运茶叶。
沿途各地税率：${rateList}。
你的性格：避险${merchant.traits.riskAverse.toFixed(2)}、机动${merchant.traits.mobility.toFixed(2)}、忠诚${merchant.traits.loyalty.toFixed(2)}。

请决定应对策略，严格输出 json：
{"action":"route|bribe|smuggle|collude|hold","target":"","reason":"一句话动机"}

动作说明：
- route：改走更划算的路线（避税/绕行）
- bribe：行贿某地官员以降低过路税
- smuggle：走私绕卡
- collude：与某官员结成利益共同体
- hold：维持现状观望

用中文输出。`;
    },

    _parseMerchantDecision(raw) {
      let parsed;
      try { parsed = this._extractJSON(raw); } catch (e) { throw new Error('Invalid JSON'); }
      const valid = ['route', 'bribe', 'smuggle', 'collude', 'hold'];
      return {
        action: valid.includes(parsed.action) ? parsed.action : 'hold',
        target: parsed.target || '',
        reason: parsed.reason || ''
      };
    }
  };

  global.CKUAgents = Agents;

})(typeof window !== 'undefined' ? window : globalThis);
