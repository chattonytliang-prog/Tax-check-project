export function isInvalidClientName(value) {
  const name = String(value ?? '').trim()
  const compactName = name.replace(/[《》【】（）()[\]？?。！!，,\s]/g, '')
  if (!compactName) return true
  if (compactName.length < 4) return true
  if (/^\d+$/.test(compactName)) return true
  if (/^(开票日期|填发日期|序号|项目|名称|企业名称|纳税人名称|单位名称|日期|合计|总计)$/.test(compactName)) return true
  if (/^(?:你知道)?(?:我|我们|本|该|这家|客户)公司(?:叫什么名字|叫什么|名称是什么|是什么)?$/.test(compactName)) return true
  if (/^(增值税|附加税费|税额抵减|科目余额表|余额表|工资表|明细账|资产负债表|利润表|现金流量表|发票清单|综合所得申报|个人所得税|企业所得税|纳税申报|申报表|附列资料|情况表|资料|报表)/.test(compactName)) return true
  if (/(申报表|附列资料|情况表|余额表|工资表|明细账|发票清单|纳税申报表|资料|报表)$/.test(compactName)) return true
  return false
}
