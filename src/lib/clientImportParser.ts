import { conditionFields } from './ruleEngine'

export type ImportMappingPreview = {
  source: string
  field: string
  label: string
}

export type ParsedClientImport = {
  patch: Record<string, unknown>
  mappings: ImportMappingPreview[]
  unmappedHeaders: string[]
  detectedTables: string[]
  detectedSourceType?: string
}

export const importFieldAliases: Record<string, string> = {
  企业名称: 'name',
  公司名称: 'name',
  客户名称: 'name',
  纳税人名称: 'name',
  单位名称: 'name',
  企业全称: 'name',
  客户全称: 'name',
  纳税主体名称: 'name',
  账套名称: 'name',
  统一社会信用代码: 'creditCode',
  纳税人识别号: 'creditCode',
  税号: 'creditCode',
  税务登记号: 'creditCode',
  统一信用代码: 'creditCode',
  社会信用代码: 'creditCode',
  纳税人编号: 'creditCode',
  客户税号: 'creditCode',
  地区: 'region',
  所属地区: 'region',
  所在地区: 'region',
  注册地址: 'region',
  经营地址: 'region',
  生产经营地址: 'region',
  主管税务机关所在地: 'region',
  登记注册地址: 'region',
  行业: 'industry',
  所属行业: 'industry',
  行业类别: 'industry',
  国民经济行业: 'industry',
  行业名称: 'industry',
  主营行业: 'industry',
  国标行业: 'industry',
  纳税人类型: 'taxpayerType',
  纳税人资格: 'taxpayerType',
  纳税人性质: 'taxpayerType',
  纳税人类别: 'taxpayerType',
  纳税人状态: 'taxpayerType',
  登记注册类型: 'taxpayerType',
  企业类型: 'taxpayerType',
  成立时间: 'establishedAt',
  成立日期: 'establishedAt',
  注册日期: 'establishedAt',
  设立日期: 'establishedAt',
  开业日期: 'establishedAt',
  登记日期: 'establishedAt',
  核准日期: 'establishedAt',
  分析口径: 'analysisPeriodType',
  分析类型: 'analysisPeriodType',
  分析期间: 'analysisPeriodType',
  期间类型: 'analysisPeriodType',
  期间口径: 'analysisPeriodType',
  检查口径: 'analysisPeriodType',
  检查期间类型: 'analysisPeriodType',
  数据期间类型: 'analysisPeriodType',
  申报期间类型: 'analysisPeriodType',
  纳税期间类型: 'analysisPeriodType',
  报表期间类型: 'analysisPeriodType',
  所属年度: 'analysisYear',
  年度: 'analysisYear',
  会计年度: 'analysisYear',
  报表年度: 'analysisYear',
  纳税年度: 'analysisYear',
  申报年度: 'analysisYear',
  税款所属年度: 'analysisYear',
  所属季度: 'analysisQuarter',
  季度: 'analysisQuarter',
  会计季度: 'analysisQuarter',
  报表季度: 'analysisQuarter',
  申报季度: 'analysisQuarter',
  税款所属季度: 'analysisQuarter',
  所属月份: 'analysisMonth',
  月份: 'analysisMonth',
  会计期间: 'analysisMonth',
  期间月份: 'analysisMonth',
  报表月份: 'analysisMonth',
  纳税月份: 'analysisMonth',
  申报月份: 'analysisMonth',
  税款所属月份: 'analysisMonth',
  所属期间: 'analysisMonth',
  账期: 'analysisMonth',
  数据期间: 'analysisMonth',
  期间开始: 'periodStartDate',
  期间起始日: 'periodStartDate',
  开始日期: 'periodStartDate',
  起始日期: 'periodStartDate',
  数据开始日期: 'periodStartDate',
  所属期起: 'periodStartDate',
  税款所属期起: 'periodStartDate',
  期间起: 'periodStartDate',
  数据起始日: 'periodStartDate',
  期间结束: 'periodEndDate',
  期间截止日: 'periodEndDate',
  结束日期: 'periodEndDate',
  截止日期: 'periodEndDate',
  数据结束日期: 'periodEndDate',
  所属期止: 'periodEndDate',
  税款所属期止: 'periodEndDate',
  期间止: 'periodEndDate',
  数据截止日: 'periodEndDate',
  数据口径: 'dataBasis',
  数据来源: 'dataBasis',
  数据来源口径: 'dataBasis',
  资料来源: 'dataBasis',
  取数口径: 'dataBasis',
  报表口径: 'dataBasis',
  数据提供方: 'dataBasis',
  申报口径: 'dataBasis',
  账套来源: 'dataBasis',
  导入来源: 'dataBasis',
  数据类型: 'dataBasis',
  对比期间: 'comparisonPeriod',
  月收入: 'monthlyRevenue',
  本月收入: 'monthlyRevenue',
  营业收入本月: 'monthlyRevenue',
  收入本月: 'monthlyRevenue',
  月成本费用: 'monthlyCost',
  本月成本费用: 'monthlyCost',
  本月成本: 'monthlyCost',
  营业成本本月: 'monthlyCost',
  成本费用本月: 'monthlyCost',
  月利润: 'monthlyProfit',
  本月利润: 'monthlyProfit',
  本月利润总额: 'monthlyProfit',
  年销售收入: 'annualRevenue',
  年营业收入: 'annualRevenue',
  年收入总额: 'annualRevenue',
  全年销售收入: 'annualRevenue',
  收款流水: 'collectionFlow',
  银行流水: 'collectionFlow',
  银行收款流水: 'collectionFlow',
  银行收款金额: 'collectionFlow',
  账户收款流水: 'collectionFlow',
  账户入账金额: 'collectionFlow',
  对公账户流水: 'collectionFlow',
  对公收款金额: 'collectionFlow',
  回款金额: 'collectionFlow',
  收款金额: 'collectionFlow',
  员工人数: 'employees',
  职工人数: 'employees',
  从业人数: 'employees',
  期末人数: 'employees',
  在职人数: 'employees',
  在册人数: 'employees',
  期末职工人数: 'employees',
  人员数量: 'employees',
  劳务人数: 'laborCount',
  外包人数: 'laborCount',
  劳务外包人数: 'laborCount',
  灵活用工人数: 'laborCount',
  外包人员数: 'laborCount',
  灵活用工人员数: 'laborCount',
  社保人数: 'socialSecurityCount',
  参保人数: 'socialSecurityCount',
  社保缴纳人数: 'socialSecurityCount',
  缴纳社保人数: 'socialSecurityCount',
  缴社保人数: 'socialSecurityCount',
  参保员工数: 'socialSecurityCount',
  社保参保人数: 'socialSecurityCount',
  工资申报人数: 'salaryDeclaredCount',
  工薪申报人数: 'salaryDeclaredCount',
  个税申报人数: 'salaryDeclaredCount',
  工资薪金申报人数: 'salaryDeclaredCount',
  个税人数: 'salaryDeclaredCount',
  申报工资人数: 'salaryDeclaredCount',
  发薪人数: 'salaryDeclaredCount',
  上季度末人数: 'previousQuarterEmployees',
  本季度收入: 'quarterRevenue',
  上季度收入: 'previousQuarterRevenue',
  本季度成本费用: 'quarterCostExpense',
  上季度成本费用: 'previousQuarterCostExpense',
  本年累计收入: 'ytdRevenue',
  营业收入本年累计: 'ytdRevenue',
  收入本年累计: 'ytdRevenue',
  本年收入累计: 'ytdRevenue',
  本年累计成本费用: 'ytdCostExpense',
  营业成本本年累计: 'ytdCostExpense',
  成本费用本年累计: 'ytdCostExpense',
  本年成本累计: 'ytdCostExpense',
  本年累计利润: 'ytdProfit',
  利润总额: 'ytdProfit',
  净利润: 'ytdProfit',
  营业利润: 'ytdProfit',
  预算收入: 'budgetRevenue',
  上年同期收入: 'previousYearRevenue',
  主营业务收入: 'mainBusinessRevenue',
  营业收入: 'mainBusinessRevenue',
  销售收入: 'mainBusinessRevenue',
  收入总额: 'mainBusinessRevenue',
  主营业务成本: 'mainBusinessCost',
  营业成本: 'mainBusinessCost',
  销售成本: 'mainBusinessCost',
  成本费用合计: 'mainBusinessCost',
  人员相关成本费用: 'peopleRelatedExpense',
  承租面积: 'rentalArea',
  转租面积: 'subleaseArea',
  装修费用: 'decorationExpense',
  月开票金额: 'monthlyInvoice',
  本月开票金额: 'monthlyInvoice',
  本期开票金额: 'monthlyInvoice',
  开票金额: 'monthlyInvoice',
  开票收入: 'monthlyInvoice',
  已开票金额: 'monthlyInvoice',
  发票金额: 'monthlyInvoice',
  发票合计金额: 'monthlyInvoice',
  含税开票金额: 'monthlyInvoice',
  存在未开票收入: 'unbilledIncome',
  未开票收入: 'unbilledIncome',
  无票收入: 'unbilledIncome',
  不开票收入: 'unbilledIncome',
  未开票销售额: 'unbilledIncome',
  未开票销售收入: 'unbilledIncome',
  无票销售: 'unbilledIncome',
  无票销售额: 'unbilledIncome',
  长期零申报: 'longTermZeroDeclaration',
  零申报: 'longTermZeroDeclaration',
  连续零申报: 'longTermZeroDeclaration',
  多月零申报: 'longTermZeroDeclaration',
  连续多月零申报: 'longTermZeroDeclaration',
  长期无收入申报: 'longTermZeroDeclaration',
  多期零申报: 'longTermZeroDeclaration',
  预收款长期挂账: 'prepaidLongTerm',
  预收账款长期挂账: 'prepaidLongTerm',
  合同负债长期挂账: 'prepaidLongTerm',
  预收款挂账: 'prepaidLongTerm',
  预收账款挂账: 'prepaidLongTerm',
  预收账款挂账余额: 'prepaidLongTerm',
  合同负债挂账: 'prepaidLongTerm',
  合同负债挂账余额: 'prepaidLongTerm',
  大额费用无票: 'largeExpenseNoInvoice',
  大额无票费用: 'largeExpenseNoInvoice',
  费用无发票: 'largeExpenseNoInvoice',
  无发票费用: 'largeExpenseNoInvoice',
  无票费用: 'largeExpenseNoInvoice',
  无票报销: 'largeExpenseNoInvoice',
  无票入账: 'largeExpenseNoInvoice',
  大额费用未取得发票: 'largeExpenseNoInvoice',
  服务费发票异常: 'serviceFeeInvoices',
  服务费发票: 'serviceFeeInvoices',
  咨询服务费发票: 'serviceFeeInvoices',
  技术服务费发票: 'serviceFeeInvoices',
  服务类发票: 'serviceFeeInvoices',
  咨询费发票: 'serviceFeeInvoices',
  技术服务发票: 'serviceFeeInvoices',
  服务费票据: 'serviceFeeInvoices',
  存在关联交易: 'relatedTransactions',
  关联交易: 'relatedTransactions',
  关联方交易: 'relatedTransactions',
  关联购销: 'relatedTransactions',
  关联采购: 'relatedTransactions',
  关联销售: 'relatedTransactions',
  关联方购销: 'relatedTransactions',
  关联往来交易: 'relatedTransactions',
  供应商无进项: 'supplierNoInput',
  供应商无进项发票: 'supplierNoInput',
  采购无进项: 'supplierNoInput',
  进项缺失: 'supplierNoInput',
  供应商进项缺失: 'supplierNoInput',
  供应商进项票缺失: 'supplierNoInput',
  供应商未取得进项: 'supplierNoInput',
  采购未取得进项发票: 'supplierNoInput',
  发票品名不匹配: 'invoiceNameMismatch',
  发票品名异常: 'invoiceNameMismatch',
  品名不匹配: 'invoiceNameMismatch',
  票货品名不符: 'invoiceNameMismatch',
  发票货物名称不一致: 'invoiceNameMismatch',
  票品不符: 'invoiceNameMismatch',
  发票内容不符: 'invoiceNameMismatch',
  商品服务名称不符: 'invoiceNameMismatch',
  进销不匹配: 'purchaseSalesMismatch',
  进销项不匹配: 'purchaseSalesMismatch',
  采购销售不匹配: 'purchaseSalesMismatch',
  购销不匹配: 'purchaseSalesMismatch',
  进项销项不符: 'purchaseSalesMismatch',
  进销品类不一致: 'purchaseSalesMismatch',
  购销品类不符: 'purchaseSalesMismatch',
  采购销售品类不一致: 'purchaseSalesMismatch',
  资金回流: 'fundsReturn',
  资金回转: 'fundsReturn',
  回款回流: 'fundsReturn',
  资金闭环: 'fundsReturn',
  资金回流闭环: 'fundsReturn',
  资金循环: 'fundsReturn',
  回款异常回流: 'fundsReturn',
  付款后回流: 'fundsReturn',
  异常发票: 'abnormalInvoice',
  风险发票: 'abnormalInvoice',
  失控发票: 'abnormalInvoice',
  虚开发票: 'abnormalInvoice',
  异常凭证: 'abnormalInvoice',
  涉嫌虚开: 'abnormalInvoice',
  走逃失联发票: 'abnormalInvoice',
  税收风险发票: 'abnormalInvoice',
  非金融利息异常: 'nonFinancialInterestAbnormal',
  非金融机构利息异常: 'nonFinancialInterestAbnormal',
  民间借贷利息异常: 'nonFinancialInterestAbnormal',
  借款利息异常: 'nonFinancialInterestAbnormal',
  企业间管理费: 'intercompanyManagementFee',
  集团管理费: 'intercompanyManagementFee',
  总部管理费: 'intercompanyManagementFee',
  关联管理费: 'intercompanyManagementFee',
  关联定价异常: 'relatedPricingAbnormal',
  关联定价不公允: 'relatedPricingAbnormal',
  关联交易定价异常: 'relatedPricingAbnormal',
  关联价格异常: 'relatedPricingAbnormal',
  工资拆分发放: 'salarySplit',
  工资拆分: 'salarySplit',
  拆分发薪: 'salarySplit',
  分拆发放工资: 'salarySplit',
  拆分工资: 'salarySplit',
  工资分拆: 'salarySplit',
  分拆发薪: 'salarySplit',
  多人拆分发薪: 'salarySplit',
  未履行个税扣缴: 'noIitWithholding',
  未代扣个税: 'noIitWithholding',
  个税未扣缴: 'noIitWithholding',
  未申报个税扣缴: 'noIitWithholding',
  个税未代扣代缴: 'noIitWithholding',
  未代扣代缴个税: 'noIitWithholding',
  工资个税未申报: 'noIitWithholding',
  未申报工资薪金个税: 'noIitWithholding',
  关联个体户: 'individualVendorRelated',
  关联个人独资: 'individualVendorRelated',
  个体户关联交易: 'individualVendorRelated',
  个人独资关联交易: 'individualVendorRelated',
  关联自然人商户: 'individualVendorRelated',
  关联个体工商户: 'individualVendorRelated',
  核定征收个体户: 'individualVendorRelated',
  关联个人供应商: 'individualVendorRelated',
  享受小微企业优惠: 'smallProfitEnjoyed',
  享受小型微利优惠: 'smallProfitEnjoyed',
  小微企业优惠: 'smallProfitEnjoyed',
  小型微利企业优惠: 'smallProfitEnjoyed',
  小型微利减免: 'smallProfitEnjoyed',
  小微企业所得税优惠: 'smallProfitEnjoyed',
  小型微利所得税优惠: 'smallProfitEnjoyed',
  享受小型微利企业所得税优惠: 'smallProfitEnjoyed',
  长期亏损: 'longTermLoss',
  连续亏损: 'longTermLoss',
  多年亏损: 'longTermLoss',
  长期亏损企业: 'longTermLoss',
  连续多年亏损: 'longTermLoss',
  连续年度亏损: 'longTermLoss',
  连续亏损企业: 'longTermLoss',
  多年度亏损: 'longTermLoss',
  税费优惠资料不足: 'taxBenefitDataMissing',
  优惠资料不足: 'taxBenefitDataMissing',
  税收优惠资料缺失: 'taxBenefitDataMissing',
  税费优惠备查资料不足: 'taxBenefitDataMissing',
  优惠备查资料缺失: 'taxBenefitDataMissing',
  减免税资料不足: 'taxBenefitDataMissing',
  税收优惠留存资料不足: 'taxBenefitDataMissing',
  税收优惠备查资料缺失: 'taxBenefitDataMissing',
  享受研发加计扣除: 'rdDeductionEnjoyed',
  研发加计扣除: 'rdDeductionEnjoyed',
  研发费用加计扣除: 'rdDeductionEnjoyed',
  研发加计优惠: 'rdDeductionEnjoyed',
  享受研发费用加计扣除: 'rdDeductionEnjoyed',
  研发费用加计扣除优惠: 'rdDeductionEnjoyed',
  研发费用加计: 'rdDeductionEnjoyed',
  研发加计扣除优惠: 'rdDeductionEnjoyed',
  库存异常: 'inventoryAbnormal',
  存货异常: 'inventoryAbnormal',
  库存账实异常: 'inventoryAbnormal',
  存货账实不符: 'inventoryAbnormal',
  存货账实异常: 'inventoryAbnormal',
  库存盘点异常: 'inventoryAbnormal',
  存货盘点差异: 'inventoryAbnormal',
  库存金额异常: 'inventoryAbnormal',
  研发资料不足: 'rdDocsInsufficient',
  研发资料缺失: 'rdDocsInsufficient',
  研发备查资料不足: 'rdDocsInsufficient',
  研发项目资料不足: 'rdDocsInsufficient',
  研发备查资料缺失: 'rdDocsInsufficient',
  研发项目资料缺失: 'rdDocsInsufficient',
  研发费用资料不足: 'rdDocsInsufficient',
  研发辅助账资料不足: 'rdDocsInsufficient',
  涉税服务合规风险: 'agencyComplianceRisk',
  代理记账合规风险: 'agencyComplianceRisk',
  财税服务合规风险: 'agencyComplianceRisk',
  涉税服务风险: 'agencyComplianceRisk',
  代理记账风险: 'agencyComplianceRisk',
  财税服务风险: 'agencyComplianceRisk',
  记账报税合规风险: 'agencyComplianceRisk',
  涉税代理合规风险: 'agencyComplianceRisk',
  连续12个月销售额: 'consecutive12MonthSales',
  连续十二个月销售额: 'consecutive12MonthSales',
  近12个月销售额: 'consecutive12MonthSales',
  最近12个月销售额: 'consecutive12MonthSales',
  十二个月累计销售额: 'consecutive12MonthSales',
  平台收入: 'platformRevenue',
  平台销售额: 'platformRevenue',
  电商平台收入: 'platformRevenue',
  电商平台销售额: 'platformRevenue',
  平台结算收入: 'platformRevenue',
  平台结算额: 'platformRevenue',
  第三方平台收入: 'platformRevenue',
  第三方平台销售额: 'platformRevenue',
  线上平台收入: 'platformRevenue',
  线上销售额: 'platformRevenue',
  网店销售额: 'platformRevenue',
  抖店收入: 'platformRevenue',
  美团平台收入: 'platformRevenue',
  微信收款: 'platformRevenue',
  支付宝收款: 'platformRevenue',
  个人账户收款: 'privateAccountCollection',
  私户收款: 'privateAccountCollection',
  个人卡收款: 'privateAccountCollection',
  个人账户代收款: 'privateAccountCollection',
  个人账户收款金额: 'privateAccountCollection',
  私户收款金额: 'privateAccountCollection',
  个人卡收款金额: 'privateAccountCollection',
  私人账户收款: 'privateAccountCollection',
  老板账户收款: 'privateAccountCollection',
  股东账户收款: 'privateAccountCollection',
  个人微信收款: 'privateAccountCollection',
  个人支付宝收款: 'privateAccountCollection',
  红字专票金额: 'redVatSpecialInvoiceAmount',
  红字发票金额: 'redVatSpecialInvoiceAmount',
  红冲发票金额: 'redVatSpecialInvoiceAmount',
  红字增值税专用发票金额: 'redVatSpecialInvoiceAmount',
  红冲金额: 'redVatSpecialInvoiceAmount',
  负数发票金额: 'redVatSpecialInvoiceAmount',
  红字信息表金额: 'redVatSpecialInvoiceAmount',
  红字普票金额: 'redVatSpecialInvoiceAmount',
  红字普通发票金额: 'redVatSpecialInvoiceAmount',
  销项负数发票金额: 'redVatSpecialInvoiceAmount',
  销售折让红票金额: 'redVatSpecialInvoiceAmount',
  销项税额: 'outputTax',
  本期销项税额: 'outputTax',
  本月销项税额: 'outputTax',
  当期销项税额: 'outputTax',
  应交增值税销项税额: 'outputTax',
  进项税额: 'inputTax',
  本期进项税额: 'inputTax',
  本月进项税额: 'inputTax',
  当期进项税额: 'inputTax',
  应交增值税进项税额: 'inputTax',
  增值税应纳税额: 'vatTaxPayable',
  增值税入库税额: 'vatTaxPayable',
  本期应纳税额: 'vatTaxPayable',
  本月应纳税额: 'vatTaxPayable',
  本期增值税应纳税额: 'vatTaxPayable',
  本期增值税入库税额: 'vatTaxPayable',
  增值税应税销售额: 'taxableSales',
  应纳税额合计: 'vatTaxPayable',
  销售额合计: 'taxableSales',
  货物及劳务销售额: 'taxableSales',
  本期销售额: 'taxableSales',
  本期应税销售额: 'taxableSales',
  本月应税销售额: 'taxableSales',
  一般项目销售额: 'taxableSales',
  理论增值税税额: 'theoreticalVatTax',
  预算增值税税额: 'budgetVatTax',
  上期销售额: 'priorTaxableSales',
  上期应税销售额: 'priorTaxableSales',
  上期应纳税额: 'priorVatTaxPayable',
  上期增值税税额: 'priorVatTaxPayable',
  上期增值税应纳税额: 'priorVatTaxPayable',
  上期增值税入库税额: 'priorVatTaxPayable',
  期末留抵税额: 'endingVatCredit',
  期末留抵税额合计: 'endingVatCredit',
  留抵税额: 'endingVatCredit',
  期末留抵: 'endingVatCredit',
  增值税留抵税额: 'endingVatCredit',
  留抵税额期末余额: 'endingVatCredit',
  业务招待费: 'entertainmentExpense',
  业务招待费发生额: 'entertainmentExpense',
  招待费: 'entertainmentExpense',
  招待费支出: 'entertainmentExpense',
  业务招待费支出: 'entertainmentExpense',
  业务招待费本年累计: 'entertainmentExpense',
  招待费发生额: 'entertainmentExpense',
  业务招待费累计发生额: 'entertainmentExpense',
  广告宣传费: 'adExpense',
  广告费: 'adExpense',
  业务宣传费: 'adExpense',
  广告及业务宣传费: 'adExpense',
  广告宣传费发生额: 'adExpense',
  广告及业务宣传费发生额: 'adExpense',
  广告宣传费本年累计: 'adExpense',
  广宣费: 'adExpense',
  职工福利费: 'welfareExpense',
  福利费: 'welfareExpense',
  职工福利费支出: 'welfareExpense',
  职工福利费发生额: 'welfareExpense',
  福利费发生额: 'welfareExpense',
  职工福利费本年累计: 'welfareExpense',
  工会经费: 'unionExpense',
  工会经费支出: 'unionExpense',
  工会经费发生额: 'unionExpense',
  工会经费本年累计: 'unionExpense',
  工会经费计提额: 'unionExpense',
  职工教育经费: 'educationExpense',
  教育经费: 'educationExpense',
  职工教育经费支出: 'educationExpense',
  培训费: 'educationExpense',
  职工教育经费发生额: 'educationExpense',
  教育培训经费: 'educationExpense',
  职工教育经费本年累计: 'educationExpense',
  应纳税所得额: 'taxableIncome',
  年度应纳税所得额: 'taxableIncome',
  本年应纳税所得额: 'taxableIncome',
  累计应纳税所得额: 'taxableIncome',
  企业所得税应纳税所得额: 'taxableIncome',
  所得税应纳税所得额: 'taxableIncome',
  纳税调整后所得: 'taxableIncome',
  纳税调整后所得额: 'taxableIncome',
  应税所得额: 'taxableIncome',
  年度应税所得额: 'taxableIncome',
  本年累计应纳税所得额: 'taxableIncome',
  资产总额: 'assetsTotal',
  资产总计: 'assetsTotal',
  资产合计: 'assetsTotal',
  资产总额期末余额: 'assetsTotal',
  资产总计期末余额: 'assetsTotal',
  资产合计期末余额: 'assetsTotal',
  平均资产总额: 'assetsTotal',
  资产总额平均值: 'assetsTotal',
  季末资产总额: 'assetsTotal',
  季末资产总计: 'assetsTotal',
  季末资产合计: 'assetsTotal',
  季度平均资产总额: 'assetsTotal',
  年度平均资产总额: 'assetsTotal',
  全年平均人数: 'employeeAnnualAvg',
  年平均从业人数: 'employeeAnnualAvg',
  平均从业人数: 'employeeAnnualAvg',
  从业人数平均值: 'employeeAnnualAvg',
  从业人员年平均数: 'employeeAnnualAvg',
  年平均人数: 'employeeAnnualAvg',
  全年平均从业人数: 'employeeAnnualAvg',
  从业人员平均人数: 'employeeAnnualAvg',
  年度从业人员平均数: 'employeeAnnualAvg',
  季度平均从业人数: 'employeeAnnualAvg',
  平均职工人数: 'employeeAnnualAvg',
  营业外支出发生额: 'nonOperatingExpense',
  营业外支出: 'nonOperatingExpense',
  营业外支出金额: 'nonOperatingExpense',
  非经营性支出: 'nonOperatingExpense',
  营业外支出本年累计: 'nonOperatingExpense',
  非经常性支出: 'nonOperatingExpense',
  非经营支出: 'nonOperatingExpense',
  营业外收入发生额: 'nonOperatingIncome',
  营业外收入: 'nonOperatingIncome',
  营业外收入金额: 'nonOperatingIncome',
  非经营性收入: 'nonOperatingIncome',
  营业外收入本年累计: 'nonOperatingIncome',
  非经常性收入: 'nonOperatingIncome',
  非经营收入: 'nonOperatingIncome',
  其他应收代收代付余额: 'otherReceivableAgencyBalance',
  其他应收款余额: 'otherReceivableAgencyBalance',
  其他应收款: 'otherReceivableAgencyBalance',
  代收代付余额: 'otherReceivableAgencyBalance',
  代垫款余额: 'otherReceivableAgencyBalance',
  往来款余额: 'otherReceivableAgencyBalance',
  个人代收款余额: 'otherReceivableAgencyBalance',
  老板代收款: 'otherReceivableAgencyBalance',
  股东代收款: 'otherReceivableAgencyBalance',
  员工借款余额: 'otherReceivableAgencyBalance',
  工资薪金总额: 'payrollTotal',
  工资总额: 'payrollTotal',
  应付职工薪酬: 'payrollTotal',
  职工薪酬总额: 'payrollTotal',
  薪酬总额: 'payrollTotal',
  工资薪金发生额: 'payrollTotal',
  计税工资总额: 'payrollTotal',
  应发工资总额: 'payrollTotal',
  工资薪酬合计: 'payrollTotal',
  应付工资: 'payrollTotal',
  本期工资薪金: 'payrollTotal',
  工资薪金支出: 'payrollTotal',
  职工薪酬发生额: 'payrollTotal',
  向个人支付非工资薪金所得: 'nonPayrollPersonalPayment',
  非工资薪金所得: 'nonPayrollPersonalPayment',
  劳务报酬: 'nonPayrollPersonalPayment',
  劳务费: 'nonPayrollPersonalPayment',
  个人劳务费: 'nonPayrollPersonalPayment',
  劳务报酬支出: 'nonPayrollPersonalPayment',
  个人劳务报酬: 'nonPayrollPersonalPayment',
  临时工劳务费: 'nonPayrollPersonalPayment',
  非雇员劳务费: 'nonPayrollPersonalPayment',
  灵活用工劳务费: 'nonPayrollPersonalPayment',
  个人服务费: 'nonPayrollPersonalPayment',
  自然人劳务费: 'nonPayrollPersonalPayment',
  非员工劳务报酬: 'nonPayrollPersonalPayment',
}

const preferredImportFieldLabels: Record<string, string> = {
  name: '企业名称',
  creditCode: '统一社会信用代码',
}

export const clientImportFieldLabels = {
  ...Object.entries(importFieldAliases).reduce<Record<string, string>>((labels, [label, field]) => {
    if (!labels[field] || label.length < labels[field].length) labels[field] = label
    return labels
  }, {}),
  ...preferredImportFieldLabels,
}

const importTemplateFields = [
  'name',
  'creditCode',
  'region',
  'industry',
  'taxpayerType',
  'analysisYear',
  'analysisMonth',
  'dataBasis',
  'monthlyRevenue',
  'monthlyCost',
  'monthlyProfit',
  'collectionFlow',
  'monthlyInvoice',
  'consecutive12MonthSales',
  'employees',
  'socialSecurityCount',
  'salaryDeclaredCount',
]

const importTemplateSampleRow: Array<string | number> = [
  '示例企业（请替换）',
  '请填写统一社会信用代码',
  '省市',
  '行业',
  '一般纳税人',
  2024,
  '2024-03',
  '管理报表',
  560000,
  420000,
  80000,
  620000,
  480000,
  4200000,
  35,
  32,
  35,
]

function emptyParsedClientImport(): ParsedClientImport {
  return { patch: {}, mappings: [], unmappedHeaders: [], detectedTables: [] }
}

function fieldLabel(field: string) {
  return conditionFields.find((item) => item.value === field)?.label || clientImportFieldLabels[field] || field
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function createClientImportTemplateCsv() {
  return [
    importTemplateFields.map(fieldLabel).map(csvCell).join(','),
    importTemplateSampleRow.map(csvCell).join(','),
  ].join('\r\n')
}

function normalizeImportKey(key: string) {
  return key.replace(/^\uFEFF/, '').replace(/[：:\s（）()_/-]/g, '').trim()
}

function importKeyCandidates(key: string) {
  const normalized = normalizeImportKey(key)
  return Array.from(new Set([
    normalized,
    normalized.replace(/(必填|选填|可选|人民币|金额|元|万元|数量|人数|人)+$/g, ''),
  ].filter(Boolean)))
}

function resolveImportField(key: string) {
  const candidates = importKeyCandidates(key)
  const direct = importFieldAliases[key] || candidates.map((candidate) => importFieldAliases[candidate]).find(Boolean)
  if (direct) return direct
  const matched = Object.entries(importFieldAliases).find(([label]) => candidates.includes(normalizeImportKey(label)))
  if (matched) return matched[1]
  return conditionFields.some((field) => field.value === key) ? key : null
}

function parseDelimitedRows(text: string) {
  const parseLine = (line: string) => {
    const cells: string[] = []
    let cell = ''
    let quoted = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      const next = line[index + 1]
      if (char === '"' && quoted && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = !quoted
      } else if (!quoted && (char === ',' || char === '\t')) {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += char
      }
    }

    cells.push(cell.trim())
    return cells
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
}

function parseImportedAmount(value: string) {
  const normalized = String(value || '')
    .replace(/[,，\s]/g, '')
    .replace(/[￥¥元]/g, '')
    .replace(/[()（）]/g, (char) => (char === '(' || char === '（' ? '-' : ''))
  if (!normalized || normalized === '-' || normalized === '--') return null
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function isAmountLikeCell(value: string) {
  return parseImportedAmount(value) !== null
}

function normalizeFinancialLabel(value: string) {
  return normalizeImportKey(value).replace(/^[一二三四五六七八九十\d]+[、.．]/, '')
}

function getFinancialRowLabel(row: string[]) {
  const textCells = row
    .map((cell) => cell.trim())
    .filter((cell) => cell && !isAmountLikeCell(cell))
  return normalizeFinancialLabel(textCells.slice(0, 3).join(''))
}

const financialRowFieldRules: Array<{ field: string; patterns: string[] }> = [
  { field: 'name', patterns: ['企业名称', '公司名称', '纳税人名称', '单位名称'] },
  { field: 'creditCode', patterns: ['统一社会信用代码', '纳税人识别号', '税号'] },
  { field: 'analysisYear', patterns: ['所属年度', '会计年度', '年度'] },
  { field: 'analysisMonth', patterns: ['所属月份', '期间月份', '会计期间'] },
  { field: 'ytdRevenue', patterns: ['营业收入本年累计', '收入本年累计', '本年累计收入'] },
  { field: 'monthlyRevenue', patterns: ['营业收入本月', '收入本月', '本月收入'] },
  { field: 'mainBusinessRevenue', patterns: ['主营业务收入', '营业收入', '销售收入'] },
  { field: 'ytdCostExpense', patterns: ['营业成本本年累计', '成本费用本年累计', '本年累计成本'] },
  { field: 'monthlyCost', patterns: ['营业成本本月', '成本费用本月', '本月成本'] },
  { field: 'mainBusinessCost', patterns: ['主营业务成本', '营业成本', '销售成本'] },
  { field: 'ytdProfit', patterns: ['利润总额', '净利润', '营业利润'] },
  { field: 'assetsTotal', patterns: ['资产总计', '资产合计', '资产总额', '资产总额期末余额', '资产合计期末余额'] },
  { field: 'payrollTotal', patterns: ['工资薪金', '应付职工薪酬', '工资总额', '职工薪酬'] },
  { field: 'outputTax', patterns: ['销项税额', '应交增值税销项税额'] },
  { field: 'inputTax', patterns: ['进项税额', '应交增值税进项税额'] },
  { field: 'priorTaxableSales', patterns: ['上期应税销售额', '上期销售额', '上期货物及劳务销售额'] },
  { field: 'priorVatTaxPayable', patterns: ['上期应纳税额', '上期增值税税额', '上期增值税应纳税额', '上期增值税入库税额'] },
  { field: 'vatTaxPayable', patterns: ['应交增值税', '增值税应纳税额', '应纳税额合计'] },
  { field: 'taxableSales', patterns: ['应税销售额', '销售额合计', '货物及劳务销售额'] },
  { field: 'endingVatCredit', patterns: ['期末留抵税额', '期末留抵', '留抵税额'] },
  { field: 'collectionFlow', patterns: ['银行存款', '收款流水', '现金及银行存款'] },
  { field: 'entertainmentExpense', patterns: ['业务招待费'] },
  { field: 'adExpense', patterns: ['广告费', '业务宣传费', '广告宣传费'] },
  { field: 'welfareExpense', patterns: ['职工福利费'] },
  { field: 'unionExpense', patterns: ['工会经费'] },
  { field: 'educationExpense', patterns: ['职工教育经费'] },
  { field: 'nonOperatingExpense', patterns: ['营业外支出'] },
  { field: 'nonOperatingIncome', patterns: ['营业外收入'] },
  { field: 'otherReceivableAgencyBalance', patterns: ['其他应收款', '代收代付'] },
]

function detectImportSourceType(rows: string[][]) {
  const sample = rows.slice(0, 20).flat().join(' ')
  if (/金蝶|Kingdee|KIS|云星空|精斗云/i.test(sample)) return '金蝶导出表'
  if (/用友|Yonyou|YonSuite|U8|NC|好会计/i.test(sample)) return '用友导出表'
  if (/科目余额|利润表|资产负债表|增值税|申报表/.test(sample)) return '财务导出表'
  return undefined
}

function detectImportTables(rows: string[][]) {
  const sample = rows.slice(0, 30).flat().join(' ')
  const tables: string[] = []
  if (/科目余额|科目编码|科目名称|期初余额|期末余额/.test(sample)) tables.push('科目余额表')
  if (/利润表|营业收入|营业成本|利润总额|净利润/.test(sample)) tables.push('利润表')
  if (/资产负债表|资产总计|资产总额|资产合计|负债合计|所有者权益/.test(sample)) tables.push('资产负债表')
  if (/增值税|销项税额|进项税额|应税销售额|纳税申报|留抵税额/.test(sample)) tables.push('增值税数据')
  return Array.from(new Set(tables))
}

const defaultFinancialAmountHeaders = ['本年累计金额', '本期金额', '本月金额', '期末余额', '贷方发生额', '借方发生额', '金额', '税额', '销售额', '累计数', '本月数']

const fieldAmountHeaderPreferences: Record<string, string[]> = {
  mainBusinessRevenue: ['本期贷方', '贷方发生额', '本年累计贷方', '本年累计金额', '本期金额', '金额'],
  monthlyRevenue: ['本期贷方', '贷方发生额', '本月金额', '本期金额', '金额'],
  ytdRevenue: ['本年累计贷方', '本年累计金额', '贷方发生额', '本期贷方', '金额'],
  mainBusinessCost: ['本期借方', '借方发生额', '本年累计借方', '本年累计金额', '本期金额', '金额'],
  monthlyCost: ['本期借方', '借方发生额', '本月金额', '本期金额', '金额'],
  ytdCostExpense: ['本年累计借方', '本年累计金额', '借方发生额', '本期借方', '金额'],
  inputTax: ['本期借方', '借方发生额', '进项税额', '税额', '期末余额', '金额'],
  outputTax: ['本期贷方', '贷方发生额', '销项税额', '税额', '期末余额', '金额'],
  taxableSales: ['应税销售额', '销售额合计', '销售额', '货物及劳务销售额', '金额'],
  vatTaxPayable: ['应纳税额合计', '应纳税额', '增值税应纳税额', '入库税额', '税额', '金额'],
  priorTaxableSales: ['上期应税销售额', '上期销售额', '销售额', '货物及劳务销售额', '金额'],
  priorVatTaxPayable: ['上期应纳税额', '上期增值税税额', '上期增值税应纳税额', '上期增值税入库税额', '税额', '金额'],
  endingVatCredit: ['期末留抵税额合计', '期末留抵税额', '期末留抵', '留抵税额', '税额', '金额'],
  collectionFlow: ['本期借方', '借方发生额', '期末余额', '金额'],
  assetsTotal: ['期末余额', '期末数', '期末金额', '资产总额期末余额', '资产总计期末余额', '金额'],
}

function findFinancialAmount(row: string[], headerRow?: string[], field?: string) {
  const preferredHeaders = [
    ...(field ? fieldAmountHeaderPreferences[field] || [] : []),
    ...defaultFinancialAmountHeaders,
  ]
  if (headerRow) {
    const normalizedHeaders = headerRow.map(normalizeFinancialLabel)
    for (const header of preferredHeaders) {
      const index = normalizedHeaders.findIndex((item) => item.includes(normalizeFinancialLabel(header)))
      const amount = index >= 0 ? parseImportedAmount(row[index] || '') : null
      if (amount !== null) return amount
    }
  }
  const amounts = row.map(parseImportedAmount).filter((value): value is number => value !== null)
  return amounts.find((value) => value !== 0) ?? amounts[0] ?? null
}

function findFinancialTextValue(row: string[], patterns: string[]) {
  const normalizedPatterns = patterns.map(normalizeFinancialLabel)
  return row.find((cell) => {
    const normalized = normalizeFinancialLabel(cell)
    return normalized && !isAmountLikeCell(cell) && !normalizedPatterns.some((pattern) => normalized.includes(pattern))
  }) || ''
}

function mergeParsedClientImports(base: ParsedClientImport, extra: ParsedClientImport): ParsedClientImport {
  const patch = { ...extra.patch, ...base.patch }
  const seenMappings = new Set<string>()
  const mappings = [...base.mappings, ...extra.mappings].filter((item) => {
    const key = `${item.source}-${String(item.field)}`
    if (seenMappings.has(key)) return false
    seenMappings.add(key)
    return true
  })
  return {
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set([...base.unmappedHeaders, ...extra.unmappedHeaders])).slice(0, 12),
    detectedTables: Array.from(new Set([...base.detectedTables, ...extra.detectedTables])),
    detectedSourceType: chooseImportSourceType(base.detectedSourceType, extra.detectedSourceType),
  }
}

function chooseImportSourceType(base?: string, extra?: string) {
  if (!base) return extra
  if (!extra) return base
  if (base === '财务导出表' && extra !== base) return extra
  return base
}

function parseFinancialExportRows(rows: string[][]): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const detectedTables = detectImportTables(rows)
  const detectedSourceType = detectImportSourceType(rows)
  const headerRow = rows.find((row) => row.some((cell) => /项目|科目|本期|本月|本年|期末|金额|税额|余额/.test(cell)))

  rows.forEach((row) => {
    const rowLabel = getFinancialRowLabel(row)
    if (!rowLabel) return
    const rule = financialRowFieldRules.find((item) => (
      item.patterns.some((pattern) => rowLabel.includes(normalizeFinancialLabel(pattern)))
    ))
    if (!rule) return
    const amount = findFinancialAmount(row, headerRow, rule.field)
    const rawValue = ['name', 'creditCode', 'analysisYear', 'analysisMonth'].includes(rule.field)
      ? findFinancialTextValue(row, rule.patterns) || row[row.length - 1]
      : amount
    if (rawValue === null || rawValue === undefined || rawValue === '') return
    patch[rule.field] = rawValue
    mappings.push({ source: row.slice(0, 3).filter(Boolean).join(' / '), field: rule.field, label: fieldLabel(rule.field) })
  })

  return {
    patch,
    mappings,
    unmappedHeaders: [],
    detectedTables,
    detectedSourceType,
  }
}

function countRecognizedHeaders(row: string[]) {
  return row.filter((cell) => resolveImportField(cell)).length
}

function chooseTabularHeaderRows(rows: string[][]) {
  const [firstRow, secondRow, thirdRow] = rows
  if (!firstRow) return null

  const secondRowFieldCount = secondRow ? countRecognizedHeaders(secondRow) : 0
  if (secondRow && thirdRow && secondRow.length > 2 && secondRowFieldCount >= 2) {
    return { headers: secondRow, values: thirdRow }
  }

  const firstRowFieldCount = countRecognizedHeaders(firstRow)
  if (firstRow.length > 2 || Boolean(
    secondRow && firstRow.length > 1 && firstRowFieldCount === firstRow.length && !resolveImportField(secondRow[0] || ''),
  )) {
    return secondRow ? { headers: firstRow, values: secondRow } : null
  }

  return null
}

function resolveFinancialRowField(label: string) {
  const rowLabel = normalizeFinancialLabel(label)
  if (!rowLabel) return null
  return financialRowFieldRules.find((item) => (
    item.patterns.some((pattern) => rowLabel.includes(normalizeFinancialLabel(pattern)))
  ))?.field || null
}

export function parseClientImportRows(rows: string[][]): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const unmappedHeaders: string[] = []
  if (!rows.length) return emptyParsedClientImport()
  const detectedTables = detectImportTables(rows)
  const detectedSourceType = detectImportSourceType(rows)

  const mapValue = (source: string, value: string) => {
    const normalizedSource = source.trim()
    if (!normalizedSource) return
    const field = resolveImportField(normalizedSource)
    if (field) {
      patch[field] = value
      mappings.push({ source: normalizedSource, field, label: fieldLabel(field) })
    } else {
      unmappedHeaders.push(normalizedSource)
    }
  }

  const tabularRows = chooseTabularHeaderRows(rows)
  if (tabularRows) {
    tabularRows.headers.forEach((header, index) => {
      mapValue(header, tabularRows.values[index])
    })
  } else {
    rows.forEach(([key, value]) => {
      const financialField = detectedTables.length ? resolveFinancialRowField(key) : null
      if (financialField && ['mainBusinessRevenue', 'mainBusinessCost', 'ytdProfit'].includes(financialField)) return
      mapValue(key, value)
    })
  }

  return mergeParsedClientImports({
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set(unmappedHeaders)).slice(0, 12),
    detectedTables,
    detectedSourceType,
  }, parseFinancialExportRows(rows))
}

function parseClientImportObject(raw: Record<string, unknown>): ParsedClientImport {
  const patch: Record<string, unknown> = {}
  const mappings: ImportMappingPreview[] = []
  const unmappedHeaders: string[] = []
  Object.entries(raw).forEach(([source, value]) => {
    const field = resolveImportField(source)
    if (field) {
      patch[field] = value
      mappings.push({ source, field, label: fieldLabel(field) })
    } else {
      unmappedHeaders.push(source)
    }
  })
  return {
    patch,
    mappings,
    unmappedHeaders: Array.from(new Set(unmappedHeaders)).slice(0, 12),
    detectedTables: [],
  }
}

export function parseClientImportText(text: string): ParsedClientImport {
  const trimmed = text.trim()
  if (!trimmed) return emptyParsedClientImport()
  if (trimmed.startsWith('{')) return parseClientImportObject(JSON.parse(trimmed) as Record<string, unknown>)
  return parseClientImportRows(parseDelimitedRows(trimmed))
}

function looksLikeMojibake(text: string) {
  return text.includes('\uFFFD') || /[锟�]{2,}|[ÃÂ][\u0080-\u00ff]/.test(text)
}

export function decodeClientImportText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!looksLikeMojibake(utf8)) return utf8
  try {
    const gb18030 = new TextDecoder('gb18030').decode(buffer)
    return looksLikeMojibake(gb18030) ? utf8 : gb18030
  } catch {
    return utf8
  }
}

export async function parseClientImportWorkbook(buffer: ArrayBuffer): Promise<ParsedClientImport> {
  const XLSX = await import('@e965/xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  return workbook.SheetNames.reduce<ParsedClientImport>((parsed, sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return parsed
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    })
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some(Boolean))
    if (!rows.length) return parsed

    return mergeParsedClientImports(parsed, parseClientImportRows(rows))
  }, emptyParsedClientImport())
}
