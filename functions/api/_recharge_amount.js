// Amounts are integer yuan, and points are always derived by the server.
// The one-yuan test order is deliberately not accepted by this helper.
export function standardRecharge(yuan) {
  const selected = yuan === undefined ? 200 : yuan
  if (!Number.isInteger(selected) || selected < 200 || selected > 1000) return null
  return { amountFen: selected * 100, points: selected, description: `税务风控报告积分充值${selected}积分` }
}

export const rechargeRangeError = '请输入 200 至 1000 元之间的整数金额。'
