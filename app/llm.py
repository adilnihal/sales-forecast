"""Optional LLM explanation via Claude API. Falls back to rule-based text."""
from __future__ import annotations

import os

from .forecast import explain


def llm_explain(item: str, hist: list[dict], fc: dict, backtest: dict) -> str:
    base = explain(item, hist, fc)
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return base
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        recent = ", ".join(f"{h['date'][:7]}: {h['qty']:.0f}" for h in hist[-12:])
        if backtest["mape_model"] is None:
            bt_line = "Backtest: not enough history yet"
        else:
            bt_line = f"Backtest MAPE: {backtest['mape_model']:.1f}% vs naive {backtest['mape_baseline']:.1f}%"
        prompt = (
            "You are advising a small shop owner in Kerala. In 2-3 short sentences, "
            "explain this demand forecast in plain language and say what to do. "
            "Do not invent causes you cannot see in the data; mention seasonality only "
            "if the numbers show it.\n\n"
            f"Item: {item}\nLast 12 months (units): {recent}\n"
            f"Forecast next month: {fc['qty']:.0f} (range {fc['lower']:.0f}-{fc['upper']:.0f})\n"
            f"{bt_line}"
        )
        msg = client.messages.create(
            model=os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5"),
            max_tokens=250,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return base
