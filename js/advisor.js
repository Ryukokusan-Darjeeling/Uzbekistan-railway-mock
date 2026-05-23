// ============================================
// AI 建议模块 — advisor.js
// Groq API + 本地规则引擎备选
// ============================================

class CargoAdvisor {
  constructor() {
    this.apiKey = '';
    this.useAPI = false;
    this.isLoading = false;
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    this.useAPI = this.apiKey.length > 0;
  }

  async getAdvice(simulationSummary) {
    if (this.isLoading) return null;
    this.isLoading = true;

    try {
      if (this.useAPI) {
        return await this._getGroqAdvice(simulationSummary);
      } else {
        return this._getLocalAdvice(simulationSummary);
      }
    } catch (error) {
      console.error('Advisor error:', error);
      // Fallback to local
      return this._getLocalAdvice(simulationSummary);
    } finally {
      this.isLoading = false;
    }
  }

  async _getGroqAdvice(summary) {
    const prompt = this._buildPrompt(summary);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: i18n.t('advisor.prompt.system')
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Groq API Error: ${response.status} - ${errData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content || '无法获取建议 / Unable to get advice';

    return {
      source: 'AI (Groq / Llama 3.1)',
      content: aiText,
      raw: true
    };
  }

  _buildPrompt(summary) {
    let cargoInfo = '';
    const isZH = i18n.lang === 'zh';
    
    if (isZH) {
      summary.cargoPerformance.forEach((c, i) => {
        cargoInfo += `${i + 1}. ${c.name} (${c.nameEn}): 收益 $${formatNumber(c.revenue)}, 运量 ${formatNumber(c.volume)}吨, 环比趋势 ${c.trend}\n`;
      });

      return `
当前模拟日期：${summary.currentDate}
累计总收益：$${formatNumber(summary.totalRevenue)}
本月总收益：$${formatNumber(summary.monthRevenue)}
环比变化：${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%
已模拟月数：${summary.monthsSimulated}

本月各货物表现（按收益排序）：
${cargoInfo}

请为下个月（${summary.nextMonth}）提供货物调度建议：
1. 推荐增加运量的2种货物及原因
2. 推荐减少运量的1种货物及原因
3. 预计下月市场趋势分析
4. 具体调度策略建议（包括建议运量调整百分比）
`;
    } else {
      summary.cargoPerformance.forEach((c, i) => {
        cargoInfo += `${i + 1}. ${c.nameEn}: Revenue $${formatNumber(c.revenue)}, Volume ${formatNumber(c.volume)} tons, MoM Trend ${c.trend}\n`;
      });

      const nextMonthName = MONTH_NAMES_EN[summary.nextMonthIndex];

      return `
Current Simulation Date: ${MONTH_NAMES_EN[summary.currentMonth]} ${summary.currentYear}
Cumulative Total Revenue: $${formatNumber(summary.totalRevenue)}
Monthly Revenue: $${formatNumber(summary.monthRevenue)}
Month-over-Month Change: ${summary.delta.percentage > 0 ? '+' : ''}${summary.delta.percentage.toFixed(1)}%
Months Simulated: ${summary.monthsSimulated}

This month's cargo performance (sorted by revenue):
${cargoInfo}

Please provide cargo dispatch recommendations for next month (${nextMonthName}):
1. 2 cargo types recommended for increasing volume and reasons
2. 1 cargo type recommended for decreasing volume and reasons
3. Market trend analysis for next month
4. Concrete dispatch strategy recommendations (including suggested volume adjustment percentages)
`;
    }
  }

  _getLocalAdvice(summary) {
    const { cargoPerformance, nextMonthIndex, delta, monthsSimulated } = summary;

    // Analyze which cargo is performing best/worst
    const sorted = [...cargoPerformance];
    const bestPerformers = sorted.slice(0, 2);
    const worstPerformer = sorted[sorted.length - 1];

    // Check seasonal factors for next month
    const seasonalInsights = [];
    CARGO_TYPES.forEach(cargo => {
      const nextFactor = cargo.seasonFactor[nextMonthIndex];
      const currentFactor = cargo.seasonFactor[(nextMonthIndex + 11) % 12];
      const change = ((nextFactor - currentFactor) / currentFactor * 100).toFixed(1);

      seasonalInsights.push({
        id: cargo.id,
        name: i18n.cargoName(cargo.id),
        emoji: cargo.emoji,
        factor: nextFactor,
        change: parseFloat(change),
        growthRate: cargo.growthRate
      });
    });

    seasonalInsights.sort((a, b) => b.change - a.change);
    const topSeasonal = seasonalInsights.filter(s => s.change > 0).slice(0, 2);
    const weakSeasonal = seasonalInsights.filter(s => s.change < 0).slice(-1);

    // Build advice
    const recommendations = [];
    const localizedNextMonth = i18n.lang === 'zh' ? MONTH_NAMES[nextMonthIndex] : MONTH_NAMES_EN[nextMonthIndex];

    // Recommendation 1: Increase
    recommendations.push({
      type: 'increase',
      title: i18n.t('advisor.rec.increase'),
      items: topSeasonal.length > 0 ? topSeasonal.map(s => ({
        id: s.id,
        name: `${s.emoji} ${s.name}`,
        reason: i18n.t('advisor.rec.increaseReason', localizedNextMonth, s.change),
        factor: s.factor
      })) : bestPerformers.map(bp => ({
        id: bp.id,
        name: `${bp.emoji || ''} ${i18n.cargoName(bp.id)}`,
        reason: i18n.t('advisor.rec.maintainReason', bp.trend),
        factor: 1.0
      }))
    });

    // Recommendation 2: Decrease
    if (weakSeasonal.length > 0) {
      recommendations.push({
        type: 'decrease',
        title: i18n.t('advisor.rec.decrease'),
        items: weakSeasonal.map(s => ({
          id: s.id,
          name: `${s.emoji} ${s.name}`,
          reason: i18n.t('advisor.rec.decreaseSeasonReason', s.change)
        }))
      });
    } else {
      recommendations.push({
        type: 'decrease',
        title: i18n.t('advisor.rec.decrease'),
        items: [{
          id: worstPerformer.id,
          name: `${worstPerformer.emoji || ''} ${i18n.cargoName(worstPerformer.id)}`,
          reason: i18n.t('advisor.rec.decreaseWorstReason', worstPerformer.trend)
        }]
      });
    }

    // Market trend
    const overallTrend = delta.percentage > 5 ? i18n.t('advisor.market.strongUp') :
                          delta.percentage > 0 ? i18n.t('advisor.market.steadyGrow') :
                          delta.percentage > -5 ? i18n.t('advisor.market.fluctuate') : i18n.t('advisor.market.decline');

    const trendEmoji = delta.percentage > 5 ? '🚀' :
                        delta.percentage > 0 ? '📊' :
                        delta.percentage > -5 ? '⚖️' : '⚠️';

    // Growth cargo recommendation
    const highGrowth = CARGO_TYPES.reduce((best, c) =>
      c.growthRate > best.growthRate ? c : best, CARGO_TYPES[0]);

    const trendDesc = i18n.lang === 'zh' 
      ? `整体市场${overallTrend}。${monthsSimulated > 3 ? i18n.t('advisor.market.matureOps') : i18n.t('advisor.market.earlyOps')}`
      : `Overall market is showing ${overallTrend.toLowerCase()}. ${monthsSimulated > 3 ? i18n.t('advisor.market.matureOps') : i18n.t('advisor.market.earlyOps')}`;

    return {
      source: i18n.t('advisor.source.local'),
      content: null,
      raw: false,
      structured: {
        marketTrend: {
          emoji: trendEmoji,
          trend: overallTrend,
          deltaStr: `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`,
          description: trendDesc
        },
        recommendations,
        strategy: {
          title: i18n.t('advisor.strategy.title'),
          points: [
            i18n.t('advisor.strategy.focus', highGrowth.emoji, i18n.cargoName(highGrowth.id), (highGrowth.growthRate * 100).toFixed(1)),
            i18n.t('advisor.strategy.europe'),
            delta.percentage > 0 ? i18n.t('advisor.strategy.expand') : i18n.t('advisor.strategy.optimize'),
            i18n.t('advisor.strategy.layout')
          ]
        },
        // Concrete adjustments for simulation
        adjustments: this._buildAdjustments(topSeasonal, weakSeasonal, bestPerformers, worstPerformer)
      }
    };
  }

  // Build concrete volume adjustment multipliers from analysis
  _buildAdjustments(topSeasonal, weakSeasonal, bestPerformers, worstPerformer) {
    const adjustments = {};

    // Increase recommendations: +15-20%
    if (topSeasonal.length > 0) {
      topSeasonal.forEach(s => {
        adjustments[s.id] = 1.0 + Math.min(s.change, 20) / 100;
      });
    } else {
      bestPerformers.forEach(bp => {
        adjustments[bp.id] = 1.10;
      });
    }

    // Decrease recommendations: -10-15%
    if (weakSeasonal.length > 0) {
      weakSeasonal.forEach(s => {
        adjustments[s.id] = 1.0 + Math.max(s.change, -15) / 100;
      });
    } else {
      adjustments[worstPerformer.id] = 0.88;
    }

    return adjustments;
  }

  // Parse AI (Groq) raw response to extract volume adjustments
  static parseRawAdviceToAdjustments(rawText) {
    const adjustments = {};

    // Try to find percentage patterns like "增加 15%" or "increase 10%"
    for (const cargo of CARGO_TYPES) {
      const namesPattern = `(${cargo.name}|${cargo.nameEn})`;
      
      const increaseRegex = new RegExp(namesPattern + '[\\s\\S]{0,60}(增加|提升|扩大|increase|raise|boost|up)[\\s]*(\\d+)[\\s]*[%％]', 'i');
      const decreaseRegex = new RegExp(namesPattern + '[\\s\\S]{0,60}(减少|降低|缩减|decrease|reduce|drop|down)[\\s]*(\\d+)[\\s]*[%％]', 'i');

      const incMatch = rawText.match(increaseRegex);
      const decMatch = rawText.match(decreaseRegex);

      if (incMatch) {
        const pct = Math.min(parseInt(incMatch[2]), 30); // Cap at 30%
        adjustments[cargo.id] = 1.0 + pct / 100;
      } else if (decMatch) {
        const pct = Math.min(parseInt(decMatch[2]), 25); // Cap at 25%
        adjustments[cargo.id] = 1.0 - pct / 100;
      }
    }

    // If we couldn't parse anything specific, use moderate defaults
    if (Object.keys(adjustments).length === 0) {
      // Provide gentle adjustments based on keywords
      for (const cargo of CARGO_TYPES) {
        const namesPattern = `(${cargo.name}|${cargo.nameEn})`;
        if (rawText.match(new RegExp(namesPattern, 'i'))) {
          if (rawText.match(new RegExp(namesPattern + '[\\s\\S]{0,40}(增加|提升|扩大|重点|increase|raise|boost|focus)', 'i'))) {
            adjustments[cargo.id] = 1.12;
          } else if (rawText.match(new RegExp(namesPattern + '[\\s\\S]{0,40}(减少|降低|缩减|compression|decrease|reduce|cut)', 'i'))) {
            adjustments[cargo.id] = 0.88;
          }
        }
      }
    }

    return adjustments;
  }

  // Format local advice as HTML
  static formatAdviceHTML(advice) {
    if (advice.raw) {
      // AI raw response — render as text with simple formatting
      const formatted = advice.content
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/(\d+\.\s)/g, '<br>$1');
      return `
        <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
          🤖 ${i18n.t('ai.title')}: ${advice.source}
        </div>
        <div style="line-height:1.9">${formatted}</div>
      `;
    }

    // Structured local advice
    const { marketTrend, recommendations, strategy } = advice.structured;

    let html = `
      <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
        🧠 ${i18n.t('ai.title')}: ${advice.source} (${i18n.t('advisor.source.localNote')})
      </div>

      <h3 style="margin-bottom:12px">${marketTrend.emoji} ${i18n.t('advisor.market.trend')}：${marketTrend.trend} (${marketTrend.deltaStr})</h3>
      <p style="margin-bottom:16px;color:var(--text-secondary)">${marketTrend.description}</p>
    `;

    recommendations.forEach(rec => {
      html += `<h3 style="margin:16px 0 8px;font-size:0.95rem">${rec.title}</h3>`;
      rec.items.forEach(item => {
        html += `
          <div class="recommendation">
            <strong>${item.name}</strong><br>
            <span style="color:var(--text-secondary)">${item.reason}</span>
          </div>
        `;
      });
    });

    html += `<h3 style="margin:16px 0 8px;font-size:0.95rem">${strategy.title}</h3>`;
    html += '<ul style="list-style:none;padding:0">';
    strategy.points.forEach(point => {
      html += `<li style="padding:6px 0;color:var(--text-secondary);border-bottom:1px solid rgba(255,255,255,0.03)">• ${point}</li>`;
    });
    html += '</ul>';

    return html;
  }
}

window.CargoAdvisor = CargoAdvisor;
