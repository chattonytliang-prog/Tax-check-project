export const enterpriseReviewPolicy = {
  suspended: 'ON-058',
  unverifiedExpenses: ['R015', 'R016', 'ON-020', 'ON-021'] as const,
  personnel: ['R021', 'ON-091', 'ON-092'] as const,
}

export function participatesInEnterpriseScoring(code: string) {
  const key = code.trim().toUpperCase()
  return key !== enterpriseReviewPolicy.suspended && !enterpriseReviewPolicy.unverifiedExpenses.some((code) => code === key) && !/^(YW-|FILING-)/.test(key)
}

export function enterpriseRuleLevel(code: string, level: '高' | '中' | '低') {
  return enterpriseReviewPolicy.personnel.some((key) => key === code.trim().toUpperCase()) && level === '高' ? '中' : level
}

export function duplicatePersonnelRuleCodes(codes: readonly string[]) {
  return enterpriseReviewPolicy.personnel.filter((code) => codes.includes(code)).slice(1)
}
