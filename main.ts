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
 */

import { runBars } from './vendor/makefun-bars.ts';

const symbol = 'CBBTC';
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
      const tp = (pos.cost * 102n) / 100n;
      const sl = (pos.cost * 996n) / 1000n;
      const timeStop = barsInPosition >= 60;

      if (val >= tp || val <= sl || timeStop) {
        barsInPosition = 0;
        cooldown = 15;
        return [{
          side: 'sell',
          symbol,
          qty: pos.qty,
          max_slippage_bps: 150,
        }];
      }
      return [];
    } else {
      barsInPosition = 0;
      if (cooldown > 0) {
        cooldown--;
        return [];
      }

      if (list.length < 60) return [];

      const latestClose = list[list.length - 1]!;
      const close3Ago = list[list.length - 4];
      
      let sum = 0n;
      for (let i = list.length - 60; i < list.length; i++) {
        sum += list[i]!;
      }
      const sma60 = sum / 60n;

      const surge = close3Ago !== undefined && latestClose >= (close3Ago * 101n) / 100n;
      const dip = latestClose <= (sma60 * 985n) / 1000n;

      if (surge || dip) {
        let notional = (state.equity * 70n) / 100n;
        const room = state.weightRoom(symbol);
        if (notional > room) notional = room;
        if (notional > state.cash) notional = state.cash;

        const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
        if (notional >= minNotional && notional > 0n) {
          return [{
            side: 'buy',
            symbol,
            notional_quote_units: notional,
            max_slippage_bps: 120,
          }];
        }
      }
    }
    return [];
  },
});
