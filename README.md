# CKU Railway Economic Simulator (Uzbekistan-railway-mock)

A premium, interactive, and intelligent web-based economic simulation dashboard for the **China-Kyrgyzstan-Uzbekistan (CKU) Railway**. This simulator models dynamic cargo flows, seasonal market fluctuations, regional revenue sharing, and leverages both a **Local Rule-Based Expert System** and **Generative AI (Groq / Llama 3.1)** to provide predictive dispatch suggestions.

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
- **Local Rule Engine**: Analyzes seasonal factors and recent monthly cargo performance using heuristics to recommend optimal volume adjustments (Top 2 increased by +15-20%, Bottom 1 reduced by -10-15%).
- **Cloud LLM Integration**: Connects to the **Groq API (Llama 3.1)** for natural-language economic analysis. It automatically parses textual suggestions (e.g., "increase electronics by 15%") and extracts adjustment parameters to feed directly back into the simulator.
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

---

## 👥 Authorship & Open Source

This project is created and maintained with ❤️ by **Darjeeling**.

- **Author**: Darjeeling
- **GitHub Repository**: [Ryukokusan-Darjeeling / Uzbekistan-railway-mock](https://github.com/Ryukokusan-Darjeeling/Uzbekistan-railway-mock.git)
- **License**: MIT License - feel free to fork, customize, and experiment!

---

*Disclaimer: All economic figures, cargo growth ratios, and seasonal factors modeled in this application are for simulation and academic visualization purposes, extrapolated based on historic China-Europe freight railway statistics.*
