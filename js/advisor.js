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
            content: '你是一个专业的铁路货物调度顾问，精通中吉乌铁路（中国-吉尔吉斯斯坦-乌兹别克斯坦铁路）的货物运输市场。你需要根据当前数据，为下个月的货物调度提供具体、可操作的建议。回复请使用中文，格式清晰，分点列出建议。'
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
    const aiText = data.choices?.[0]?.message?.content || '无法获取建议';

    return {
      source: 'AI (Groq / Llama 3.1)',
      content: aiText,
      raw: true
    };
  }

  _buildPrompt(summary) {
    let cargoInfo = '';
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
  }

  _getLocalAdvice(summary) {
    const { cargoPerformance, nextMonth, nextMonthIndex, delta, monthsSimulated } = summary;

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
        name: cargo.name,
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

    // Recommendation 1: Increase
    recommendations.push({
      type: 'increase',
      title: '📈 建议增加运量',
      items: topSeasonal.length > 0 ? topSeasonal.map(s => ({
        name: `${s.emoji} ${s.name}`,
        reason: `下月（${nextMonth}）季节性因子将提升 ${s.change > 0 ? '+' : ''}${s.change}%，建议增加运量 15-20%`,
        factor: s.factor
      })) : bestPerformers.map(bp => ({
        name: bp.name,
        reason: `本月表现优异（趋势 ${bp.trend}），市场需求旺盛，建议维持或增加 10% 运量`,
        factor: 1.0
      }))
    });

    // Recommendation 2: Decrease
    if (weakSeasonal.length > 0) {
      recommendations.push({
        type: 'decrease',
        title: '📉 建议减少运量',
        items: weakSeasonal.map(s => ({
          name: `${s.emoji} ${s.name}`,
          reason: `下月季节性因子将下降 ${s.change}%，需求可能走弱，建议减少运量 10-15%`
        }))
      });
    } else {
      recommendations.push({
        type: 'decrease',
        title: '📉 建议减少运量',
        items: [{
          name: `${worstPerformer.name}`,
          reason: `本月收益排名末尾（趋势 ${worstPerformer.trend}），建议适当减少运量，释放运力给高收益货物`
        }]
      });
    }

    // Market trend
    const overallTrend = delta.percentage > 5 ? '强劲上升' :
                          delta.percentage > 0 ? '稳步增长' :
                          delta.percentage > -5 ? '小幅波动' : '明显下滑';

    const trendEmoji = delta.percentage > 5 ? '🚀' :
                        delta.percentage > 0 ? '📊' :
                        delta.percentage > -5 ? '⚖️' : '⚠️';

    // Growth cargo recommendation
    const highGrowth = CARGO_TYPES.reduce((best, c) =>
      c.growthRate > best.growthRate ? c : best, CARGO_TYPES[0]);

    return {
      source: '本地规则引擎',
      content: null,
      raw: false,
      structured: {
        marketTrend: {
          emoji: trendEmoji,
          trend: overallTrend,
          deltaStr: `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`,
          description: `整体市场${overallTrend}。${monthsSimulated > 3 ?
            '随着铁路运营逐步成熟，运输效率持续提升。' :
            '铁路刚开始运营，市场仍在培育阶段。'}`
        },
        recommendations,
        strategy: {
          title: '🎯 综合调度策略',
          points: [
            `重点发力 ${highGrowth.emoji} ${highGrowth.name}（月增长率 ${(highGrowth.growthRate * 100).toFixed(1)}%），长期收益潜力最大`,
            `关注欧洲市场需求变化，出口欧洲占总收益约 30%，是重要利润来源`,
            delta.percentage > 0 ?
              '当前势头良好，可适度扩大总运量 5-10%' :
              '市场出现回调，建议优化货物结构而非盲目扩量',
            `建议在马克马尔换装站提前布局热门货物，减少换装等待时间`
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

    // Map seasonal names back to cargo IDs
    const nameToId = {};
    CARGO_TYPES.forEach(c => { nameToId[c.name] = c.id; });

    // Increase recommendations: +15-20%
    if (topSeasonal.length > 0) {
      topSeasonal.forEach(s => {
        const name = s.name.replace(/^[^\s]+\s/, ''); // strip emoji
        if (nameToId[name]) {
          adjustments[nameToId[name]] = 1.0 + Math.min(s.change, 20) / 100;
        }
      });
    } else {
      bestPerformers.forEach(bp => {
        // Try finding by name directly
        CARGO_TYPES.forEach(c => {
          if (bp.name.includes(c.name)) {
            adjustments[c.id] = 1.10;
          }
        });
      });
    }

    // Decrease recommendations: -10-15%
    if (weakSeasonal.length > 0) {
      weakSeasonal.forEach(s => {
        const name = s.name.replace(/^[^\s]+\s/, ''); // strip emoji
        if (nameToId[name]) {
          adjustments[nameToId[name]] = 1.0 + Math.max(s.change, -15) / 100;
        }
      });
    } else {
      CARGO_TYPES.forEach(c => {
        if (worstPerformer.name.includes(c.name)) {
          adjustments[c.id] = 0.88;
        }
      });
    }

    return adjustments;
  }

  // Parse AI (Groq) raw response to extract volume adjustments
  static parseRawAdviceToAdjustments(rawText) {
    const adjustments = {};
    const nameToId = {};
    CARGO_TYPES.forEach(c => {
      nameToId[c.name] = c.id;
      nameToId[c.nameEn.toLowerCase()] = c.id;
    });

    // Try to find percentage patterns like "增加 15%" or "减少 10%"
    for (const cargo of CARGO_TYPES) {
      // Look for the cargo name followed by increase/decrease percentage
      const increaseRegex = new RegExp(cargo.name + '[\\s\\S]{0,60}(增加|提升|扩大)[\\s]*(\\d+)[\\s]*[%％]', 'i');
      const decreaseRegex = new RegExp(cargo.name + '[\\s\\S]{0,60}(减少|降低|缩减)[\\s]*(\\d+)[\\s]*[%％]', 'i');

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
        if (rawText.includes(cargo.name)) {
          if (rawText.match(new RegExp(cargo.name + '[\\s\\S]{0,30}(增加|提升|扩大|重点)', 'i'))) {
            adjustments[cargo.id] = 1.12;
          } else if (rawText.match(new RegExp(cargo.name + '[\\s\\S]{0,30}(减少|降低|缩减|压缩)', 'i'))) {
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
          🤖 来源：${advice.source}
        </div>
        <div style="line-height:1.9">${formatted}</div>
      `;
    }

    // Structured local advice
    const { marketTrend, recommendations, strategy } = advice.structured;

    let html = `
      <div style="margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">
        🧠 来源：${advice.source}（未配置 API Key，使用本地分析引擎）
      </div>

      <h3 style="margin-bottom:12px">${marketTrend.emoji} 市场趋势：${marketTrend.trend} (${marketTrend.deltaStr})</h3>
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
