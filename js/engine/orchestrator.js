// ============================================
// orchestrator.js — 回合调度器（禁止 DOM）
// 回合循环：制度推进 → 经济结算 → 角色决策 → 制度裁决 → 经济更新
// 3.0 迁移：整体搬到 FastAPI 异步任务，接口不变
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;
  const Institution = global.CKUInstitution;
  const Economy = global.CKUEconomy;
  const Agents = global.CKUAgents;
  const LLM = global.CKULLM;

  const Orchestrator = {
    // 进度回调（由 UI 注入，engine 不碰 DOM）
    onTurnUpdate: null,

    _emit(phase, data) {
      if (typeof this.onTurnUpdate === 'function') {
        try { this.onTurnUpdate(phase, data); } catch (e) { /* UI 异常不阻断 */ }
      }
    },

    // ---- 单回合推进 ----
    // Phase 1.5 顺序：换官（契约作废）→ 官员决策裁决 → 商人决策 → 现金流结算（含分账）→ 指标
    async step(state) {
      const events = [];

      // 1. 制度引擎：推进任期、触发换官/考成（换官自动作废该官契约）
      this._emit('institution', null);
      const rotationEvents = Institution.advanceMonth(state);
      events.push(...rotationEvents);

      // 2. 智能体层：官员观察 → 生成动作（品级/含权量/上下级感知）
      this._emit('agents', null);
      const officials = state.officials;
      for (const official of officials) {
        official.cityName = (state.cities.find(c => c.id === official.city) || {}).name || official.city;

        // 上报：该官员开始决策
        this._emit('agent_start', {
          role: 'official',
          name: official.name,
          post: official.post,
          city: official.cityName,
          faction: official.faction
        });

        let decision;
        try {
          decision = await Agents.decideOfficial(official, state, LLM);
        } catch (err) {
          // AI 决策失败：归一化并附带角色上下文，上抛给 UI（不自动降级）
          throw this._agentError('official', official.name, err);
        }

        // 上报：该官员决策完成
        this._emit('agent_done', {
          role: 'official',
          name: official.name,
          post: official.post,
          city: official.cityName,
          decision
        });

        // 3. 制度引擎：裁决动作合法性，应用后果
        const verdict = Institution.adjudicate(official, decision, state);

        // 应用动作后果
        this._applyAction(official, decision, verdict, state);

        // 勾结：发起即成约（双边契约，Phase 1.5）
        if (decision.type === 'collude' && decision.targetId && verdict.legal) {
          this._makeContract(state, official.id, decision.targetId, official.city);
        }

        // 记录事件
        events.push(this._actionEvent(official, decision, verdict, state));
      }

      // 4. 商人决策（AI 代表 + 规则商人），应用到商人本月决策槽
      for (const m of state.merchants) {
        this._emit('agent_start', {
          role: 'merchant',
          name: m.name,
          post: m.origin,
          city: '',
          faction: m.origin
        });

        let md = null;
        if (m.isAI) {
          try {
            md = await Agents.decideMerchant(m, state, LLM);
          } catch (err) {
            throw this._agentError('merchant', m.name, err);
          }
        } else {
          md = Agents.ruleMerchantDecision(m, state);
        }

        m.decision = md || { action: 'hold', reason: '观望' };

        // 商人发起勾结：target 是官员名 → 成约
        if (md && md.action === 'collude' && md.target) {
          const o = state.officials.find(x => x.name === md.target || x.name.includes(md.target));
          if (o) this._makeContract(state, o.id, m.id, o.city);
        }

        this._emit('agent_done', {
          role: 'merchant',
          name: m.name,
          post: m.origin,
          city: '',
          decision: m.decision
        });

        events.push({ type: 'merchant', merchantId: m.id, name: m.name, action: m.decision.action, reason: m.decision.reason, monthIndex: state.meta.monthIndex });
      }

      // 5. 经济引擎：现金流结算（税率/打点/勾结/走私 → 本金涨落 → 分账 → 破产/进场 → 含权量重算）
      this._emit('economy', null);
      const { colludeSplits } = Economy.settle(state);

      // 分账事件（一行一账）
      colludeSplits.forEach(s => {
        const cityName = (state.cities.find(c => c.id === s.cityId) || {}).name;
        events.push({
          type: 'collude_split',
          merchantName: s.merchantName, officialName: s.officialName, city: cityName,
          evaded: s.evaded, officialGet: s.officialGet, merchantGet: s.merchantGet,
          share: s.officialShare,
          detail: `${s.merchantName} × ${cityName}${s.officialName}：本月避税 ${s.evaded} 两，官得 ${s.officialGet} 两（${Math.round(s.officialShare * 100)}%），商留 ${s.merchantGet} 两`,
          monthIndex: state.meta.monthIndex
        });
      });

      // 6. 更新指标（回合仅此一次，避免重复计数）
      this._emit('economy_update', null);
      Economy.updateMetrics(state);

      // 写入事件日志
      state.eventLog.push(...events);
      this._trimEventLog(state);

      // 清空商人本月决策槽（下月重新决策）
      state.merchants.forEach(m => { m.decision = null; });

      // 持久化
      S.persist(state);

      return events;
    },

    // ---- 建立勾结契约（去重） ----
    _makeContract(state, officialId, merchantId, cityId) {
      if (!state.contracts) state.contracts = [];
      const exists = state.contracts.find(c =>
        c.officialId === officialId && c.merchantId === merchantId
      );
      if (exists) return;
      state.contracts.push({
        officialId, merchantId, cityId,
        sinceMonth: state.meta.monthIndex
      });
      const o = state.officials.find(x => x.id === officialId);
      const m = state.merchants.find(x => x.id === merchantId);
      if (o && m) {
        state.eventLog.push({
          type: 'contract_made', officialId, merchantId,
          detail: `${o.name} 与 ${m.name} 结成勾结契约（${(state.cities.find(c => c.id === cityId) || {}).name}）`,
          monthIndex: state.meta.monthIndex
        });
      }
    },

    // ---- 应用动作后果 ----
    _applyAction(official, decision, verdict, state) {
      if (!verdict.legal) return;
      switch (decision.type) {
        case 'tax': {
          official.lastAction = {
            type: 'tax',
            rate: decision.rate,
            appliedRate: verdict.appliedRate,
            monthIndex: state.meta.monthIndex
          };
          // 加税带来短期税收私囊（部分克扣）
          official.wealth += (official._taxBase || 0) * decision.rate * 0.5;
          break;
        }
        case 'embezzle': {
          official.wealth += decision.amount;
          official.lastAction = {
            type: 'embezzle', amount: decision.amount,
            exposed: verdict.exposed, monthIndex: state.meta.monthIndex
          };
          if (verdict.exposed) {
            official.politicalCapital = Math.max(0, official.politicalCapital - 20);
          }
          break;
        }
        case 'bribe': {
          official.politicalCapital = Math.min(100, official.politicalCapital + decision.amount / 200);
          official.lastAction = { type: 'bribe', amount: decision.amount, monthIndex: state.meta.monthIndex };
          break;
        }
        case 'placeRelative': {
          // institution.bribeForSuccession 已在 adjudicate 内扣费
          official.lastAction = { type: 'placeRelative', success: verdict.success, amount: decision.amount, monthIndex: state.meta.monthIndex };
          break;
        }
        case 'tribute': {
          // 孝敬：财富转移已在 adjudicate 完成；此处记录
          official.lastAction = {
            type: 'tribute', amount: decision.amount,
            to: verdict.superiorName || '', monthIndex: state.meta.monthIndex
          };
          break;
        }
        case 'collude': {
          // 契约已在 step 内建立；分账金额由 economy 按实际避税额精确结算
          official.lastAction = { type: 'collude', target: decision.target, monthIndex: state.meta.monthIndex };
          break;
        }
        case 'idle':
        default:
          official.lastAction = { type: 'idle', monthIndex: state.meta.monthIndex };
          break;
      }
    },

    _actionEvent(official, decision, verdict, state) {
      const base = {
        type: 'official',
        officialId: official.id,
        name: official.name,
        post: official.post,
        city: official.cityName || official.city,
        action: decision.type,
        reason: decision.reason,
        source: decision.source,
        legal: verdict.legal,
        monthIndex: state.meta.monthIndex
      };
      if (decision.type === 'tax') base.detail = `税率 ${(verdict.appliedRate * 100).toFixed(0)}%${verdict.note ? '（' + verdict.note + '）' : ''}`;
      if (decision.type === 'embezzle') base.detail = `克扣 ${Math.round(decision.amount)} 两${verdict.exposed ? '（贪腐暴露）' : ''}`;
      if (decision.type === 'placeRelative') base.detail = verdict.success ? '打点成功，亲族将接班' : '打点失败';
      if (decision.type === 'tribute') base.detail = `孝敬上级 ${Math.round(decision.amount)} 两${verdict.superiorName ? ' → ' + verdict.superiorName : ''}`;
      if (decision.type === 'collude' && decision.target) base.detail = `与 ${decision.target} 结成勾结契约`;
      return base;
    },

    // ---- 事件日志裁剪（控制 localStorage 体积） ----
    _trimEventLog(state) {
      const MAX = 200;
      if (state.eventLog.length > MAX) {
        state.eventLog = state.eventLog.slice(-MAX);
      }
    },

    // ---- 归一化智能体错误并附角色上下文（供 UI 渲染错误卡片） ----
    _agentError(role, name, err) {
      const normalized = LLM.normalizeError(err);
      const e = new Error(normalized.detail);
      e.agentError = {
        type: normalized.type,
        role,
        name,
        detail: normalized.detail
      };
      return e;
    },

    // ---- 快进 N 回合 ----
    async fastForward(state, n) {
      for (let i = 0; i < n; i++) {
        await this.step(state);
      }
    },

    // ---- 重置 ----
    reset() {
      return S.makeInitialState();
    }
  };

  global.CKUOrchestrator = Orchestrator;

})(typeof window !== 'undefined' ? window : globalThis);
