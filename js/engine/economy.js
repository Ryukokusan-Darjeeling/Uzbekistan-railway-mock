// ============================================
// economy.js — 经济引擎（确定性结算，禁止 DOM）
// 商人选路（利润最大化）→ 各段税负 → 总贸易量 → 官员税基
// 核心反馈：一地加税抬升整线成本 → 商人绕道 → 该地税基缩水
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;

  const Economy = {
    // ---- 每回合经济结算 ----
    settle(state) {
      // 1. 汇总各城税率（制度基准 + 官员加成）
      this._updateTaxRates(state);

      // 2. 商人选路
      state.merchants.forEach((m) => {
        m.route = this.chooseRoute(m, state);
      });

      // 3. 按路线聚合贸易量
      const volumeByRoute = {};
      state.tradeLine.routes.forEach((r) => { volumeByRoute[r.id] = 0; });
      state.merchants.forEach((m) => {
        if (m.route) volumeByRoute[m.route] = (volumeByRoute[m.route] || 0) + 1;
      });
      state.tradeLine.volumeByRoute = volumeByRoute;

      // 4. 总贸易量（受税率与绕行影响）
      const avgTax = this._avgEffectiveTax(state);
      const totalVolume = Math.max(0, state.tradeLine.totalVolume * (1 - avgTax * 1.5));
      state.tradeLine.totalVolume = Math.round(totalVolume * 100) / 100;

      // 5. 官员税基：流经其驻地的贸易量 × 税率
      this._settleTaxBase(state);

      return state.tradeLine;
    },

    // ---- 指标更新（由 orchestrator 在回合末尾调用一次，避免重复计数） ----
    updateMetrics(state) {
      this._updateMetrics(state);
    },

    // ---- 更新各城实际税率 ----
    _updateTaxRates(state) {
      const rates = {};
      state.cities.forEach((c) => {
        // 制度基准税率 5%，官员动作可加
        let rate = 0.05;
        const official = state.officials.find((o) => o.city === c.id);
        if (official && official.lastAction && official.lastAction.type === 'tax') {
          rate = official.lastAction.appliedRate !== undefined
            ? official.lastAction.appliedRate
            : Math.min(rate + 0.05, state.params.taxRateCap);
        }
        rates[c.id] = rate;
      });
      state.tradeLine.taxRateByCity = rates;
    },

    _avgEffectiveTax(state) {
      const rates = Object.values(state.tradeLine.taxRateByCity || {});
      if (rates.length === 0) return 0.05;
      return rates.reduce((a, b) => a + b, 0) / rates.length;
    },

    // ---- 商人选路：利润 = 卖价 − 成本 − 税负 − 风险 ----
    chooseRoute(merchant, state) {
      const routes = state.tradeLine.routes;
      let best = null;
      let bestProfit = -Infinity;

      routes.forEach((r) => {
        const tax = this._routeTax(r, state);
        const risk = r.baseRisk;
        const cost = r.baseCost;
        // 卖价基准（茶叶到恰克图口岸的卖价），简化固定
        const sellPrice = 100;
        const profit = sellPrice - cost - tax - risk * 20;
        // 商人性情影响：风险厌恶者更倾向低风险（主线）即使利润略低
        const adjusted = profit - (merchant.traits.riskAverse) * risk * 5;
        if (adjusted > bestProfit) {
          bestProfit = adjusted;
          best = r.id;
        }
      });

      return best;
    },

    _routeTax(route, state) {
      const rates = state.tradeLine.taxRateByCity || {};
      let total = 0;
      route.path.forEach((cityId) => {
        total += rates[cityId] || 0.05;
      });
      return total * 100; // 换算为成本单位
    },

    // ---- 官员税基：流经其驻地城市的贸易量 × 税率 ----
    _settleTaxBase(state) {
      state.officials.forEach((o) => {
        const cityId = o.city;
        const rate = (state.tradeLine.taxRateByCity || {})[cityId] || 0.05;
        // 流经该城的商人数量（近似税基）
        let passing = 0;
        state.merchants.forEach((m) => {
          const route = state.tradeLine.routes.find((r) => r.id === m.route);
          if (route && route.path.includes(cityId)) passing += 1;
        });
        o._taxBase = passing * state.tradeLine.totalVolume * rate;
      });
    },

    _updateMetrics(state) {
      const m = state.metrics;
      m.tradeHealth.push({ month: state.meta.monthIndex, value: state.tradeLine.totalVolume });

      // 官员财富时序（离任带走财富的排行用）
      const wealth = state.officials.map((o) => ({ id: o.id, name: o.name, wealth: Math.round(o.wealth) }));
      m.officialWealth.push({ month: state.meta.monthIndex, officials: wealth });

      // 腐败指数：实际征收 vs 上缴（简化：私囊 / 税基）
      let corruption = 0;
      state.officials.forEach((o) => {
        const taxBase = o._taxBase || 0;
        corruption += taxBase > 0 ? (o.wealth / (taxBase + o.wealth)) : 0;
      });
      m.corruptionIndex.push({ month: state.meta.monthIndex, value: corruption / Math.max(1, state.officials.length) });

      // 商路迁移：陆路主线占比（Phase 1 只有陆路，先记录主线 vs 支线）
      const v = state.tradeLine.volumeByRoute || {};
      const main = v['land_main'] || 0;
      const alt = v['land_alt'] || 0;
      const total = Math.max(1, main + alt);
      m.routeMigration.push({ month: state.meta.monthIndex, landMain: main / total, landAlt: alt / total });
    }
  };

  global.CKUEconomy = Economy;

})(typeof window !== 'undefined' ? window : globalThis);
