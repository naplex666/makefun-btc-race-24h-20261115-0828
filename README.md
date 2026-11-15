# Dual-Trigger CBBTC Trading Bot

A high-performance TypeScript trading bot built for the `make.fun` `btc-race-24h` bounty (`bars-replay/v1`).

## Strategy Overview
- **Universe**: CBBTC (tracking up to 256 historical closes).
- **Entry Triggers**:
  1. **Surge**: Latest close is $\ge +1.0\%$ above the close 3 bars ago.
  2. **Dip**: Latest close is $\le 98.5\%$ of the 60-bar simple moving average (SMA).
- **Position Sizing**: 70% of equity, capped by weight room and available cash.
- **Exits**:
  - Take Profit: $+2.0\%$ over position cost.
  - Stop Loss: $-0.4\%$ under position cost.
  - Time Stop: 60 bars held.
- **Cooldown**: 15 bars post-exit before taking new entries.
- **Execution**: Deterministic Node.js TypeScript runtime with vendored SDK shim.
