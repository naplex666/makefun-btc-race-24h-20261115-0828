/**
 * Dual-trigger long-only cbBTC trading bot for make.fun btc-race-24h.
 * 
 * Triggers (Entry):
 * - SURGE: latest close is >= +1.0% above close 3 bars ago.
 * - DIP: latest close is <= 98.5% of the 60-bar simple moving average of closes.
 * 
 * Exits:
 * - Take Profit: +2.0% over position cost.
 * - Stop Loss: -0.4% under position cost.
 * - Time Stop: 60 bars held.
 * 
 * Post-exit cooldown: 15 bars.
 * Size: 70% of equity (capped by weight room and cash).
 * 
 * Constants below serve as the single source of truth for all strategy thresholds.
 */

import { runBars } from './vendor/makefun-bars.ts';

const symbol = 'CBBTC';
const SURGE_BARS = 3;
const SURGE_NUM = 101n;
const SURGE_DEN = 100n;
const SMA_N = 60;
const DIP_NUM = 985n;
const DIP_DEN = 1000n;
const TP_NUM = 102n;
const TP_DEN = 100n;
const SL_NUM = 996n;
const SL_DEN = 1000n;
const TIME_STOP_BARS = 60;
const COOLDOWN_BARS = 15;
const SIZE_NUM = 70n;
const SIZE_DEN = 100n;
const BUY_SLIPPAGE_BPS = 120;
const SELL_SLIPPAGE_BPS = 150;

const closes = new Map<string, bigint[]>();
let cooldown = 0;
let barsInPosition = 0;

await runBars({
  onBatch(state, batch) {
    for (const b of batch.bars) {
      let list = closes.get(b.symbol);
      if (!list) {
        list = [];
        closes.set(b.symbol, list);
      }
      list.push(BigInt(b.c));
      if (list.length > 256) list.shift();
    }

    const pos = state.positions.get(symbol);
    const list = closes.get(symbol) ?? [];

    if (pos && pos.qty > 0n) {
      barsInPosition++;
      const val = state.value(symbol, pos.qty);
      const tp = (pos.cost * TP_NUM) / TP_DEN;
      const sl = (pos.cost * SL_NUM) / SL_DEN;
      const timeStop = barsInPosition >= TIME_STOP_BARS;

      if (val >= tp || val <= sl || timeStop) {
        barsInPosition = 0;
        cooldown = COOLDOWN_BARS;
        return [{
          side: 'sell',
          symbol,
          qty: pos.qty,
          max_slippage_bps: SELL_SLIPPAGE_BPS,
        }];
      }
      return [];
    } else {
      barsInPosition = 0;
      if (cooldown > 0) {
        cooldown--;
        return [];
      }

      if (list.length < SMA_N) return [];

      const latestClose = list[list.length - 1]!;
      const close3Ago = list[list.length - 1 - SURGE_BARS];
      
      let sum = 0n;
      for (let i = list.length - SMA_N; i < list.length; i++) {
        sum += list[i]!;
      }
      const sma60 = sum / BigInt(SMA_N);

      const surge = close3Ago !== undefined && latestClose >= (close3Ago * SURGE_NUM) / SURGE_DEN;
      const dip = latestClose <= (sma60 * DIP_NUM) / DIP_DEN;

      if (surge || dip) {
        let notional = (state.equity * SIZE_NUM) / SIZE_DEN;
        const room = state.weightRoom(symbol);
        if (notional > room) notional = room;
        if (notional > state.cash) notional = state.cash;

        const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
        if (notional >= minNotional && notional > 0n) {
          return [{
            side: 'buy',
            symbol,
            notional_quote_units: notional,
            max_slippage_bps: BUY_SLIPPAGE_BPS,
          }];
        }
      }
    }
    return [];
  },
});
