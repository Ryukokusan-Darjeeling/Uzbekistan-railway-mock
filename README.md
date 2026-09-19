# CKU Railway Economic Simulator (Uzbekistan-railway-mock)

A premium, interactive, and intelligent web-based economic simulation dashboard for the **China-Kyrgyzstan-Uzbekistan (CKU) Railway**. This simulator models dynamic cargo flows, seasonal market fluctuations, regional revenue sharing, and leverages both a **Local Rule-Based Expert System** and a **Multi-Agent LLM Dispatch Pipeline (DeepSeek)** to provide predictive dispatch suggestions.

---

## 🌟 Key Features

### 1. Advanced Simulation Engine
- **Monte Carlo Random Simulation**: Stochastic volume and price sampling combined with deterministic growth trends.
- **Multiplicative Seasonal Decomposition**: Modulates monthly volumes based on real-world seasonality indexes (0.7 ~ 1.4) across six major cargo types.
- **Price Volatility Model**: Simulates random market uncertainty by introducing ±15% price fluctuations.
- **Regional Revenue Split**: Automatically distributes revenue based on rail line segment lengths:
  - **China Section** (213 km / 30% revenue share)
  - **Kyrgyzstan Section** (300 km / 25% revenue share)
  - **Uzbekistan Section** (60 km / 15% revenue share)
  - **Europe Connection** (~4,000 km / 30% revenue share)

### 2. Dual-Core AI Cargo Dispatch Advisor
- **Local Rule Engine**: Analyzes seasonal factors and recent monthly cargo performance using heuristics to recommend optimal volume adjustments (Top 2 increased by +15-20%, Bottom 1 reduced by -10-15%). Serves as both the offline fallback and the A/B comparison baseline.
- **Multi-Agent Dispatch Pipeline (DeepSeek, default mode)**: Three role agents run as a sequential pipeline over the **DeepSeek API** (`deepseek-flash`), communicating exclusively through validated JSON contracts:
  1. **Market Analyst** — compresses raw monthly data into a market brief (trend, opportunities, risks, season outlook);
  2. **Dispatch Planner** — turns the brief plus decision memory into a draft plan (recommendations + volume multipliers);
  3. **Risk Officer** — reviews the draft with an **approve / modify / reject** verdict; review comments are injected into the final strategy.
- **Single-Agent Mode**: The original one-shot JSON decision agent is fully preserved — switchable in the UI for A/B comparison and as a lighter alternative.
- **Robustness Engineering**: Each stage has a 60s timeout (AbortController) plus one retry, and degrades independently (analyst failure → planner uses raw data; risk officer failure → draft adopted as-is). All final multipliers pass through **code-enforced guardrails** (clamped to 0.75~1.30, max ±10% change per month) regardless of LLM output. API failures surface as a categorized **error card with retry / local-engine buttons** — never a silent fallback.
- **Closed-Loop Decision Memory**: Every applied adjustment's actual revenue outcome vs. baseline is recorded (persisted in localStorage, up to 12 months) and injected into future prompts, so the agents learn from their own track record.
- **Live Pipeline Timeline UI**: Watch the three stages light up in sequence (pending → running → done/failed), with a pipeline badge on the advice card summarizing the review verdict.
- **Side-by-Side Strategy Sandbox**: Simulates both the "AI-Adopted" and "Baseline (No-AI)" scenarios concurrently, offering interactive differential analysis charts (Revenue Gain, Change Rate).

### 3. High-Fidelity UI & Interactions
- **Leaflet.js GIS Interactive Map**: Features dynamic route path highlights, segment hover popups, and click-to-focus regional cargo breakdown cards.
- **Fully Animated Charts**: Live month-over-month trendlines, cargo distribution doughnuts, and comparative line charts built with **Chart.js**.
- **Real-Time Dynamic Language Switcher (EN/ZH)**: Instantly translates the entire application (including active charts, tables, numbers, maps, and even the local AI advisor's recommendations) with smooth, interactive transitions.
- **Image Export Tool**: Features an HTML5 Canvas drawing suite to compile comparative charts, titles, and timestamps into exportable PNG reports.

---

## 🛠️ Simulation Algorithm

The mathematical foundation of the simulation runs as follows for each cargo type $i$ at month $t$:

$$\text{Volume}_i(t) = U(V_{\text{min}}, V_{\text{max}}) \times S_i[\text{month}] \times (1 + g_i)^t \times M_i$$

$$\text{Price}_i(t) = P_{\text{base}} \times U(0.85, 1.15) \times (1 + g_i)^t \times 0.5$$

$$\text{Revenue}_i(t) = \text{Volume}_i(t) \times \text{Price}_i(t)$$

Where:
- $U(A, B)$ represents a uniform random value sampled between $A$ and $B$.
- $S_i[\text{month}]$ is the month-specific seasonal index for cargo $i$.
- $g_i$ is the compound monthly growth rate (ranging from 1.0% to 3.5% based on cargo maturity).
- $M_i$ is the **AI Dispatch Volume Multiplier** (default is $1.0$, adjusted to $0.75 \sim 1.30$ under AI control).

---

## 🚀 Getting Started

### Prerequisites
To run this application locally, you only need a modern web browser and a simple local HTTP server (since some features like Leaflet.js maps and modules work best under server environments).

### Quick Launch

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Ryukokusan-Darjeeling/Uzbekistan-railway-mock.git
   cd Uzbekistan-railway-mock
   ```

2. **Start a local HTTP server**:
   
   - **Using Python (Recommended)**:
     ```bash
     python -m http.server 8000
     ```
   
   - **Using Node.js**:
     ```bash
     npm install -g http-server
     http-server -p 8000
     ```

3. **Open the browser**:
   Navigate to `http://localhost:8000` to launch the simulator.

### DeepSeek API Key (optional, enables LLM agents)

Without a key, the simulator runs on the local rule engine. To enable the LLM agents, either:

- **Paste the key in the UI** input field (session-only), or
- **Configure it locally** — create `js/config.local.js` (already gitignored):
  ```js
  window.DEEPSEEK_API_KEY = 'sk-your-key-here';
  ```
  Get a key at [platform.deepseek.com](https://platform.deepseek.com).

---

## 🤖 Multi-Agent Architecture

```
Monthly simulation data
        │
        ▼
① Market Analyst ──► market brief (JSON)
        │
        ▼
② Dispatch Planner ──► draft plan (JSON)  ◄── decision memory (past outcomes)
        │
        ▼
③ Risk Officer ──► verdict: approve / modify / reject (JSON)
        │
        ▼
Code guardrails (clamp 0.75~1.30, ±10%/month) ──► volume multipliers M_i
        │
        ▼
Next month simulation ──► actual vs baseline revenue ──► back into decision memory
```

- **Orchestration**: `js/app.js` sequences the stages; all roles share one DeepSeek client with per-stage 60s timeout + 1 retry.
- **Contracts**: each role has a dedicated system prompt and strict JSON schema; outputs are field-validated before entering the next stage.
- **Failure handling**: analyst failure → planner uses raw data; risk officer failure → draft adopted as-is; planner failure / timeout → categorized error card with **Retry** and **Use local engine** buttons.

---

## 👥 Authorship & Open Source

This project is created and maintained with ❤️ by **Darjeeling**.

- **Author**: Darjeeling
- **GitHub Repository**: [Ryukokusan-Darjeeling / Uzbekistan-railway-mock](https://github.com/Ryukokusan-Darjeeling/Uzbekistan-railway-mock.git)
- **License**: MIT License - feel free to fork, customize, and experiment!

---

*Disclaimer: All economic figures, cargo growth ratios, and seasonal factors modeled in this application are for simulation and academic visualization purposes, extrapolated based on historic China-Europe freight railway statistics.*
