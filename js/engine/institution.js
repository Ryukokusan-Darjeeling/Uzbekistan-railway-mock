// ============================================
// institution.js — 制度引擎（纯代码硬约束，禁止 DOM）
// 清朝流官制：三年任期 / 换官 / 回避 / 捐纳打点 / 考成
// LLM 只能"在制度内钻空子"，不能改这里的规则
// ============================================

(function (global) {
  'use strict';

  const S = global.CKUState;

  const Institution = {
    // ---- 回合起点：推进任期，触发换官/考成 ----
    advanceMonth(state) {
      const events = [];
      state.meta.monthIndex += 1;
      state.meta.month = ((state.meta.monthIndex - 1) % 12) + 1;
      state.meta.year = S.START_YEAR + Math.floor((state.meta.monthIndex - 1) / 12);
      state.meta.turn += 1;

      // 每个官员任期 -1
      state.officials.forEach((o) => {
        if (o.tenureRemaining > 0) {
          o.tenureRemaining -= 1;
        }
      });

      // 触发换官：任期归零
      const due = state.officials.filter((o) => o.tenureRemaining <= 0);
      due.forEach((o) => {
        const ev = this.rotateOfficial(state, o);
        events.push(ev);
      });

      return events;
    },

    // ---- 换官：离任带走财富 → 打点接班判定 → 新官上任 ----
    rotateOfficial(state, oldOfficial) {
      // 0. 契约作废：该官名下所有勾结契约随人事更迭失效（Phase 1.5）
      const broken = (state.contracts || []).filter(c => c.officialId === oldOfficial.id);
      if (broken.length && Array.isArray(state.eventLog)) {
        broken.forEach(c => {
          const m = (state.merchants || []).find(x => x.id === c.merchantId);
          state.eventLog.push({
            type: 'contract_broken', officialId: oldOfficial.id, merchantId: c.merchantId,
            merchantName: m ? m.name : c.merchantId,
            note: `${oldOfficial.name} 离任，勾结契约作废`, monthIndex: state.meta.monthIndex
          });
        });
      }
      state.contracts = (state.contracts || []).filter(c => c.officialId !== oldOfficial.id);

      // 1. 考成评估
      const appraisal = this.appraise(oldOfficial, state);
      const tookWealth = oldOfficial.wealth; // 离任带走全部私囊

      // 2. 打点接班判定：若该官在任内"安插亲戚"，且政绩不太差，亲戚继任
      let successor = null;
      let successionNote = '';
      if (oldOfficial.lastAction && oldOfficial.lastAction.type === 'placeRelative'
          && oldOfficial.lastAction.success) {
        successor = this._spawnRelative(oldOfficial, state);
        successionNote = `经打点，其亲族 ${successor.name} 接任 ${successor.post}`;
      } else {
        successor = this._spawnCandidate(oldOfficial, state);
        successionNote = `按官缺（${successor.seat}）由候补 ${successor.name} 接任`;
      }

      // 3. 替换（品级/上下级关系随官缺传递）
      const idx = state.officials.indexOf(oldOfficial);
      if (idx >= 0) {
        state.officials[idx] = successor;
      }

      return {
        type: 'rotation',
        officialId: oldOfficial.id,
        oldName: oldOfficial.name,
        newName: successor.name,
        post: successor.post,
        seat: successor.seat,
        tookWealth: Math.round(tookWealth),
        appraisal: appraisal.result,   // promote / transfer / demote
        successionNote,
        monthIndex: state.meta.monthIndex
      };
    },

    // ---- 考成：赋税达标 + 政绩 + 贪腐暴露度 → 升迁/平调/罢免 ----
    appraise(official, state) {
      const corruptionPenalty = official.exposed ? 40 : (official.wealth / 1000); // 私囊越多越危险
      let score = 50;                              // 基础分
      score -= corruptionPenalty * 0.5;
      // 含权量调制：高含权量者的政治资本更"值钱"（官官相护、考功司买账）
      score += official.politicalCapital * 0.1 * (0.5 + (official.powerIndex || 30) / 100);

      if (score >= 60) return { result: 'promote', score };
      if (score >= 30) return { result: 'transfer', score };
      return { result: 'demote', score };
    },

    // ---- 回避判定：新官不得本籍任职、距原籍五百里内回避（Phase 1 简化：按 city 抽取，默认异地） ----
    checkAvoidance(candidate, cityId) {
      // Phase 1 简化实现：候选池无籍贯字段，默认视为"异地"，返回 true
      return true;
    },

    // ---- 生成接班候选：按官缺（seat）从对应民族候选池抽取，姓名不得与在任者重复 ----
    _spawnCandidate(oldOfficial, state) {
      const used = new Set(state.officials.map(o => o.name));
      const name = S.pickName(oldOfficial.faction, used);
      const succ = S.makeOfficial({
        post: oldOfficial.post,
        faction: oldOfficial.faction,
        seat: oldOfficial.seat,
        city: oldOfficial.city,
        level: oldOfficial.level,
        rankName: oldOfficial.rankName,
        rankScore: oldOfficial.rankScore,
        superiorPost: null
      }, Math.floor(Math.random() * 1000));
      succ.name = name;
      // 上下级随官缺传递
      succ.superiorId = this._findSuperiorId(oldOfficial, state);
      return succ;
    },

    // ---- 生成亲族接班：沿用家族姓氏风格，姓名不得与在任者重复 ----
    _spawnRelative(oldOfficial, state) {
      const base = oldOfficial.name;
      const familySeg = base.split('·')[0] || base.slice(0, 1);
      const used = new Set(state.officials.map(o => o.name));
      const pool = S.CANDIDATE_POOL[oldOfficial.faction] || [];
      // 优先取同姓且未被在任者占用的候选；否则生成式谱名（家族姓 + 继字辈）
      const name = pool.find((n) => n.startsWith(familySeg) && !used.has(n))
        || S.genRelativeName(base, used);
      const succ = S.makeOfficial({
        post: oldOfficial.post,
        faction: oldOfficial.faction,
        seat: oldOfficial.seat,
        city: oldOfficial.city,
        level: oldOfficial.level,
        rankName: oldOfficial.rankName,
        rankScore: oldOfficial.rankScore,
        superiorPost: null
      }, Math.floor(Math.random() * 100));
      succ.name = name;
      succ.relationships.push({ type: 'relative', to: oldOfficial.name });
      // 新官"还本压力"：急于回本，贪欲偏高
      succ.traits.greed = Math.min(0.99, succ.traits.greed + 0.15);
      // 上下级随官缺传递
      succ.superiorId = this._findSuperiorId(oldOfficial, state);
      return succ;
    },

    // ---- 按官缺的 superiorPost 查现任上级 id ----
    _findSuperiorId(oldOfficial, state) {
      const seat = S.OFFICIAL_SEATS.find(s => s.post === oldOfficial.post);
      if (!seat || !seat.superiorPost) return null;
      // 排除自身（旧官还在 officials 数组里）
      const sup = state.officials.find(x => x.post === seat.superiorPost && x.id !== oldOfficial.id);
      return sup ? sup.id : null;
    },

    // ---- 捐纳打点：官员花费财富，尝试安插亲戚为下一任 ----
    bribeForSuccession(official, amount, state) {
      if (official.wealth < amount) {
        return { success: false, reason: 'insufficient_wealth' };
      }
      official.wealth -= amount;
      // 成功率与打点金额、政治资本正相关
      const successRate = Math.min(0.9, 0.2 + amount / 5000 + official.politicalCapital / 200);
      const success = Math.random() < successRate;
      official.lastAction = {
        type: 'placeRelative',
        success,
        amount,
        monthIndex: state.meta.monthIndex
      };
      return { success, reason: success ? 'ok' : 'bribe_failed' };
    },

    // ---- 裁决官员动作合法性（制度硬约束） ----
    adjudicate(official, action, state) {
      const cap = state.params.taxRateCap || 0.30;
      switch (action.type) {
        case 'tax': {
          // 加税：不得超过制度税率上限
          const requested = action.rate;
          const applied = Math.min(requested, cap);
          return { legal: true, appliedRate: applied, note: applied < requested ? '税率超上限，被制度钳制' : '' };
        }
        case 'embezzle': {
          // 克扣：金额不得超过其可接触税基，且过大会提升暴露风险
          // 含权量调制：高含权量官官相护，更难暴露（powerIndex 0~100 → 概率 × 0.5~1.0）
          const risk = (action.amount / 500) * (1 - (official.powerIndex || 30) / 200);
          official.exposed = official.exposed || Math.random() < risk;
          return { legal: true, exposed: official.exposed };
        }
        case 'tribute': {
          // 孝敬上级（陋规，LLM 自主判断）：财富转移，双方政治资本微调
          const sup = state.officials.find(o => o.id === (official.superiorId || action.target));
          if (!sup) return { legal: false, note: '无上级可孝敬' };
          if (official.wealth < action.amount) return { legal: false, note: '财富不足' };
          if (action.amount <= 0) return { legal: false, note: '金额无效' };
          official.wealth -= action.amount;
          sup.wealth += action.amount;
          official.politicalCapital = Math.min(100, official.politicalCapital + action.amount / 400);
          sup.politicalCapital = Math.min(100, sup.politicalCapital + action.amount / 600);
          official.lastTribute = action.amount;
          return { legal: true, superiorName: sup.name };
        }
        case 'bribe': {
          // 贿赂上司：花费财富换取政治资本
          if (official.wealth < action.amount) return { legal: false, note: '财富不足' };
          official.wealth -= action.amount;
          official.politicalCapital = Math.min(100, official.politicalCapital + action.amount / 200);
          return { legal: true };
        }
        case 'placeRelative': {
          return this.bribeForSuccession(official, action.amount, state);
        }
        case 'collude': {
          // 与商人勾结分账：合法（灰色），增加财富
          return { legal: true };
        }
        default:
          return { legal: false, note: 'unknown_action' };
      }
    }
  };

  global.CKUInstitution = Institution;

})(typeof window !== 'undefined' ? window : globalThis);
