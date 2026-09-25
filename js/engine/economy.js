// ============================================
// economy.js — 经济引擎（确定性结算，禁止 DOM）
// Phase 1.5 重写：商人月度现金流模拟
//   每商人：运量 → 毛收 → 运费 → 应缴税 → 实缴税（打点/勾结/走私减免）
//         → 风险损失（固定概率）→ 净利 → 本金涨落 → 破产/进场
//   勾结分账：避税额 × 官份额（0.35 + 0.003×含权量），官得 + 商留 = 避税额（守恒）
//   含权量：品级 40% + 职务 25% + 贸易量 25% + 政治资本 10%，每月重算
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;

  const Economy = {

    // ---- 每回合经济结算（现金流模拟） ----
    settle(state) {
      this._updateTaxRates(state);

      // 1. 逐商人现金流
      const ledgers = [];
      const colludeSplits = [];   // 分账记录（守恒验证用）
      state.merchants.forEach((m) => {
        const ledger = this._merchantCashflow(m, state, colludeSplits);
        if (ledger) { m.lastLedger = ledger; ledgers.push({ merchant: m, ledger }); }
      });

      // 2. 总贸易量 = 真实聚合（担/月）
      state.tradeLine.totalVolume = Math.round(
        ledgers.reduce((s, l) => s + l.ledger.shipment, 0) * 10
      ) / 10;

      // 3. 官员税基 = 该城实缴税总额（真实留成）
      this._settleTaxBase(state);

      // 4. 路线占比
      const volumeByRoute = {};
      state.tradeLine.routes.forEach((r) => { volumeByRoute[r.id] = 0; });
      state.merchants.forEach((m) => {
        if (m.route) volumeByRoute[m.route] = (volumeByRoute[m.route] || 0) + 1;
      });
      state.tradeLine.volumeByRoute = volumeByRoute;

      // 5. 破产与进场
      this._handleBankruptcy(state);

      // 6. 含权量重算
      this._updatePowerIndex(state);

      return { ledgers, colludeSplits };
    },

    // ---- 指标更新（由 orchestrator 在回合末尾调用一次） ----
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

    // ============================================
    // 单商人月度现金流（Phase 1.5 核心）
    // ============================================
    _merchantCashflow(m, state, colludeSplits) {
      const T = S.TRADE;

      // 商人选路（依据决策或规则重估）
      m.route = m.decision && m.decision.action === 'route' && m.decision.target
        ? (state.tradeLine.routes.find(r => r.id === m.decision.target) || {}).id || this.chooseRoute(m, state)
        : this.chooseRoute(m, state);
      const route = state.tradeLine.routes.find(r => r.id === m.route);
      if (!route) return null;

      const smuggling = m.decision && m.decision.action === 'smuggle';

      // 运量：受本金约束（每担货值 GOODS_VALUE）
      const shipment = Math.max(T.SHIP_MIN, Math.min(T.SHIP_MAX,
        Math.round(m.capital * 0.8 / T.GOODS_VALUE)));

      // 毛收入与运费
      const revenue = shipment * T.SELL_NET;
      const transport = shipment * route.baseCost * T.TRANSPORT_PER_COST;

      // 税：逐城计算，应用打点/勾结/走私减免
      const rates = state.tradeLine.taxRateByCity || {};
      let taxDue = 0, taxPaid = 0, bribePaid = 0;
      const bribeCity = m.decision && m.decision.action === 'bribe' ? m.decision.city : null;
      const bribeAmount = m.decision && m.decision.action === 'bribe' ? (m.decision.amount || 0) : 0;

      route.path.forEach((cityId) => {
        const rate = rates[cityId] || 0.05;
        const due = rate * shipment * T.GOODS_VALUE;
        taxDue += due;

        if (smuggling) return;                       // 走私：全程不缴（风险后算）

        // 勾结减免：契约城市实缴 COLLUDE_PAY_RATIO，余下为避税额分账
        const contract = (state.contracts || []).find(
          c => c.merchantId === m.id && c.cityId === cityId
        );
        if (contract) {
          const paid = due * T.COLLUDE_PAY_RATIO;
          const evaded = due - paid;
          taxPaid += paid;
          this._splitCollude(state, m, contract, cityId, evaded, colludeSplits);
          return;
        }

        // 打点减免：金额达标则该城税率减半，钱进官员私囊
        if (cityId === bribeCity && bribeAmount >= due * T.BRIBE_MIN_RATE) {
          const paid = due * T.BRIBE_RELIEF;
          taxPaid += paid;
          bribePaid += bribeAmount;
          const official = state.officials.find(o => o.city === cityId);
          if (official) official.wealth += bribeAmount;
          return;
        }

        taxPaid += due;
      });

      // 打点未达标：钱照付但无减免（黑吃黑）——仅当确实付了
      if (bribeCity && bribeAmount > 0 && bribePaid === 0) {
        const official = state.officials.find(o => o.city === bribeCity);
        if (official) official.wealth += bribeAmount;
        bribePaid += bribeAmount;
      }

      // 风险损失（固定概率模型）
      const risk = route.baseRisk + (smuggling ? T.SMUGGLE_RISK_ADD : 0);
      const hitRisk = Math.random() < risk;
      const loss = hitRisk ? shipment * T.GOODS_VALUE * T.RISK_LOSS_RATE : 0;

      // 净利
      const profit = Math.round((revenue - transport - taxPaid - bribePaid - loss) * 100) / 100;
      m.capital = Math.round((m.capital + profit) * 100) / 100;

      return {
        monthIndex: state.meta.monthIndex,
        shipment, revenue, transport,
        taxDue: Math.round(taxDue * 100) / 100,
        taxPaid: Math.round(taxPaid * 100) / 100,
        bribePaid: Math.round(bribePaid * 100) / 100,
        smuggled: smuggling, riskHit: hitRisk,
        loss: Math.round(loss * 100) / 100,
        profit
      };
    },

    // ---- 勾结分账：官得 + 商留 = 避税额（守恒） ----
    _splitCollude(state, merchant, contract, cityId, evaded, colludeSplits) {
      if (evaded <= 0) return;
      const official = state.officials.find(o => o.id === contract.officialId);
      if (!official) return; // 官员已换任（契约应已作废，防御）

      // 官份额 = 0.35 + 0.003 × 含权量（35%~65%）
      const officialShare = Math.min(0.65, 0.35 + 0.003 * (official.powerIndex || 30));
      const officialGet = Math.round(evaded * officialShare * 100) / 100;
      const merchantGet = Math.round((evaded - officialGet) * 100) / 100;

      official.wealth += officialGet;
      merchant.capital += merchantGet;

      colludeSplits.push({
        merchantId: merchant.id, merchantName: merchant.name,
        officialId: official.id, officialName: official.name,
        cityId, evaded: Math.round(evaded * 100) / 100,
        officialGet, merchantGet, officialShare,
        monthIndex: state.meta.monthIndex
      });
    },

    // ---- 破产与进场 ----
    _handleBankruptcy(state) {
      const T = S.TRADE;
      // 破产退出
      const survivors = [];
      state.merchants.forEach((m) => {
        if (m.capital < T.BANKRUPT_LINE) {
          state.eventLog.push({
            type: 'bankruptcy', merchantId: m.id, name: m.name, origin: m.origin,
            capital: Math.round(m.capital),
            note: `${m.name}（${m.origin}）折本歇业，余资 ${Math.round(m.capital)} 两`,
            monthIndex: state.meta.monthIndex
          });
          state.contracts = (state.contracts || []).filter(c => c.merchantId !== m.id);
          state.merchantRespawnQueue.push({
            dueMonthIndex: state.meta.monthIndex + T.RESPAWN_DELAY,
            origin: m.origin
          });
        } else {
          survivors.push(m);
        }
      });
      state.merchants = survivors;

      // 到期进场
      const stillQueued = [];
      (state.merchantRespawnQueue || []).forEach((q) => {
        if (state.meta.monthIndex >= q.dueMonthIndex) {
          const used = new Set(state.merchants.map(m => m.name));
          const nm = S.makeMerchant(q.origin, Math.floor(Math.random() * 100));
          nm.name = S.pickMerchantName(q.origin, used);
          state.merchants.push(nm);
          state.eventLog.push({
            type: 'merchant_enter', merchantId: nm.id, name: nm.name, origin: nm.origin,
            capital: Math.round(nm.capital),
            note: `${nm.name}（${q.origin}）携 ${Math.round(nm.capital)} 两本金入行`,
            monthIndex: state.meta.monthIndex
          });
        } else {
          stillQueued.push(q);
        }
      });
      state.merchantRespawnQueue = stillQueued;
    },

    // ---- 含权量重算：品级 40 + 职务 25 + 贸易量 25 + 政治资本 10 ----
    _updatePowerIndex(state) {
      // 各城流经货值（担 × 每担货值）
      const flowByCity = {};
      state.cities.forEach(c => { flowByCity[c.id] = 0; });
      state.merchants.forEach((m) => {
        const route = state.tradeLine.routes.find(r => r.id === m.route);
        if (!route) return;
        const shipment = Math.max(S.TRADE.SHIP_MIN, Math.min(S.TRADE.SHIP_MAX,
          Math.round(m.capital * 0.8 / S.TRADE.GOODS_VALUE)));
        route.path.forEach(cityId => { flowByCity[cityId] += shipment * S.TRADE.GOODS_VALUE; });
      });
      const maxFlow = Math.max(1, ...Object.values(flowByCity));

      state.officials.forEach((o) => {
        // 品级归一分：rankScore 2（从一品）→1.0，10（正五品）→0
        const rankPart = 40 * Math.max(0, Math.min(1, (10 - (o.rankScore || 10)) / 8));
        const rolePart = 25 * (S.POWER_ROLE[o.city] || 0.4);
        const flowPart = 25 * ((flowByCity[o.city] || 0) / maxFlow);
        const capitalPart = 10 * ((o.politicalCapital || 0) / 100);
        o.powerIndex = Math.round((rankPart + rolePart + flowPart + capitalPart) * 10) / 10;
      });
    },

    // ---- 商人选路：现金流净利期望最大化 ----
    chooseRoute(merchant, state) {
      const T = S.TRADE;
      const rates = state.tradeLine.taxRateByCity || {};
      let best = null;
      let bestProfit = -Infinity;

      state.tradeLine.routes.forEach((r) => {
        const shipment = Math.max(T.SHIP_MIN, Math.min(T.SHIP_MAX,
          Math.round(merchant.capital * 0.8 / T.GOODS_VALUE)));
        const revenue = shipment * T.SELL_NET;
        const transport = shipment * r.baseCost * T.TRANSPORT_PER_COST;
        let tax = 0;
        r.path.forEach((cityId) => {
          // 契约城市按实缴比例折算
          const hasContract = (state.contracts || []).some(
            c => c.merchantId === merchant.id && c.cityId === cityId
          );
          const rate = rates[cityId] || 0.05;
          tax += hasContract ? rate * shipment * T.GOODS_VALUE * T.COLLUDE_PAY_RATIO
                             : rate * shipment * T.GOODS_VALUE;
        });
        // 风险期望损失
        const riskLoss = r.baseRisk * shipment * T.GOODS_VALUE * T.RISK_LOSS_RATE;
        const profit = revenue - transport - tax - riskLoss;
        // 风险厌恶调制：厌恶者 penalize 高风险线
        const adjusted = profit - merchant.traits.riskAverse * riskLoss * 0.5;
        if (adjusted > bestProfit) {
          bestProfit = adjusted;
          best = r.id;
        }
      });

      return best;
    },

    // ---- 官员税基：该城实缴税总额（真实留成） ----
    _settleTaxBase(state) {
      state.officials.forEach((o) => {
        let base = 0;
        state.merchants.forEach((m) => {
          if (!m.lastLedger) return;
          const route = state.tradeLine.routes.find(r => r.id === m.route);
          if (!route || !route.path.includes(o.city)) return;
          // 近似：该城实缴 = 商人总实缴 × 该城税率占比
          const rates = state.tradeLine.taxRateByCity || {};
          let dueSum = 0, thisDue = 0;
          route.path.forEach(cityId => {
            const d = (rates[cityId] || 0.05);
            dueSum += d;
            if (cityId === o.city) thisDue = d;
          });
          if (dueSum > 0) base += m.lastLedger.taxPaid * (thisDue / dueSum);
        });
        o._taxBase = Math.round(base * 100) / 100;
      });
    },

    _updateMetrics(state) {
      const m = state.metrics;
      m.tradeHealth.push({ month: state.meta.monthIndex, value: state.tradeLine.totalVolume });

      // 官员财富时序（离任带走财富的排行用）
      const wealth = state.officials.map((o) => ({ id: o.id, name: o.name, wealth: Math.round(o.wealth) }));
      m.officialWealth.push({ month: state.meta.monthIndex, officials: wealth });

      // 腐败指数：私囊 / (税基 + 私囊)
      let corruption = 0;
      state.officials.forEach((o) => {
        const taxBase = o._taxBase || 0;
        corruption += taxBase > 0 ? (o.wealth / (taxBase + o.wealth)) : 0;
      });
      m.corruptionIndex.push({ month: state.meta.monthIndex, value: corruption / Math.max(1, state.officials.length) });

      // 商路迁移：主线 vs 支线
      const v = state.tradeLine.volumeByRoute || {};
      const main = v['land_main'] || 0;
      const alt = v['land_alt'] || 0;
      const total = Math.max(1, main + alt);
      m.routeMigration.push({ month: state.meta.monthIndex, landMain: main / total, landAlt: alt / total });

      // 商人本金时序（Phase 1.5）
      if (!m.merchantCapital) m.merchantCapital = [];
      m.merchantCapital.push({
        month: state.meta.monthIndex,
        merchants: state.merchants.map(x => ({ id: x.id, name: x.name, capital: Math.round(x.capital) }))
      });
    }
  };

  global.CKUEconomy = Economy;

})(typeof window !== 'undefined' ? window : globalThis);
