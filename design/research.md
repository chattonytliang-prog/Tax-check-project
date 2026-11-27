# 增值税申报前核对 · 竞品研究

范围：一般纳税人主表的预填和申报前核对。以 2026-11-28 可查的公开操作说明为依据；未进入竞品付费后台。海外产品仅用于交互对照，不作为国内税务口径来源。

| 来源 | 公开流程 | 采纳 |
| --- | --- | --- |
| [电子税务局操作说明](https://tianjin.chinatax.gov.cn/11200000000/0300/030005/20240621084516778.shtml) | 先确认所属期、预填数字和应纳结果；需要时进入填表模式。 | 先显示企业、所属期、原表来源和待核对项，保留税局栏次及表格结构。 |
| [金蝶 AI 税务云](https://www.kingdee.com/products/taxcloud.html) | 底稿数据带入申报表，在申报表内做校验与预警。 | 同期取数，一次完成预填和校验；发现差异后回到该栏次。 |
| [畅捷通好会计](https://www.chanjet.com/sem/wchatask/zt-4302.html) | 先自动取数，再给用户核对和修改预填数据。 | 待处理与原表分开呈现，可更改工作副本，仍可查看和恢复原值。 |
| [QuickBooks VAT Error Checker](https://quickbooks.intuit.com/learn-support/en-uk/help-article/banking/vat-error-checker/L1XNZ79Ch_GB_en_GB) | 申报前按问题类型核对；[官网社区附界面图与范围说明](https://quickbooks.intuit.com/community/do-more-with-quickbooks-33/vat-error-checker-103268)。 | 先看差异、缺项两类；已一致项目默认收起。不把局部核对描述为申报通过。 |
| [Xero MTD VAT](https://central.xero.com/0/article/The-VAT-Return) | 能按 VAT 栏位回看组成数据。 | 展开公式可看每个引用栏位的原表金额与当前金额；回到单元格定位，无需翻完整主表。 |

痛点：QuickBooks 的公开帮助指出差异可能源自比较的日期不一致。多期、多原表场景要暴露来源和所属期，不自动合并；如果读不到所属期，只显示未确认。数据不够时区分“无法核对”和“一致”，有支撑值但缺目标值时也只提供复算参考，不代写原表。

本次不接直连申报、缴款、票账取数或附表联动。只比较已上线口径的主表公式，不将竞品的规则、覆盖率或宣传指标用于本产品。
