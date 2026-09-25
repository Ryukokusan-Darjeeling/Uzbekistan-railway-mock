// ============================================
// llm.js — LLM 调用单一接口（禁止 DOM）
// 所有角色共用一个 callLLM(role, prompt)
// 3.0 迁移：仅需把内部 fetch 改为 fetch('/api/llm')，其余代码零改动
// ============================================

(function (global) {
  'use strict';

  const LLM = {
    // 由宿主（ui/app）注入 API Key，engine 不读 window
    apiKey: '',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
    timeoutMs: 60000,

    setApiKey(key) {
      this.apiKey = (key || '').trim();
    },

    // 各角色的 system prompt（角色人设）
    systemPrompts: {
      official: '你是一名19世纪清朝的地方官员，自私逐利，精通官场钻营。你只在制度允许的范围内钻空子谋取私利，不会改变制度本身。输出严格符合用户要求的 JSON。',
      merchant: '你是一名19世纪的商人，理性套利，趋利避害。你会根据各地税负、风险、时效选择最有利的商路与应对策略。输出严格符合用户要求的 JSON。'
    },

    async callLLM(role, userPrompt) {
      const systemPrompt = this.systemPrompts[role] || this.systemPrompts.official;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response;
      try {
        response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.6,
            stream: false
            // 不设 max_tokens：deepseek-flash 为推理模型，思考 token 计入输出额度，
            // 低上限会导致思考完毕后无 token 输出（content 为空）
          }),
          signal: controller.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('DeepSeek request timeout (60s)');
        throw err;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`DeepSeek API Error: ${response.status} - ${errData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content || !content.trim()) throw new Error('DeepSeek returned empty content');
      return content;
    },

    // ---- 错误归一化：timeout / http / parse / unknown（供 UI 显式展示） ----
    normalizeError(error) {
      const msg = (error && error.message) ? error.message : String(error);
      if (/timeout/i.test(msg)) return { type: 'timeout', detail: msg };
      if (/API Error/i.test(msg)) return { type: 'http', detail: msg };
      if (/Invalid JSON|empty content/i.test(msg)) return { type: 'parse', detail: msg };
      return { type: 'unknown', detail: msg };
    }
  };

  global.CKULLM = LLM;

})(typeof window !== 'undefined' ? window : globalThis);
