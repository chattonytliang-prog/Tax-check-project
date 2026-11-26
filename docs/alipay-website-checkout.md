# 支付宝电脑网站支付：上线前核对

应用场景：企业支付宝收款，电脑网站官方收银台。正式档位为 200、600、1000 元或 200–1000 元之间的整数自定义金额，每元对应 1 积分。Test2 本人可单独选择 1 元测试档。微信渠道保持独立。手机网站支付未开通，不要把电脑网站权限当成手机网站支付权限。

1. 在[支付宝商家平台签约管理](https://b.alipay.com/page/ar-center/ar-manage)确认正确企业的「电脑网站支付」已生效，再到[支付宝开放平台](https://open.alipay.com/)给自研网页应用配置该能力，并确认该 APPID 有线上调用权限。核对签约收款主体和结算账户。企业支付宝余额入账不等于已转入对公银行账户，实际以商家后台结算设置为准。
2. 应用采用 RSA2 公钥模式。私钥仅存服务器密钥配置，不能放聊天、代码或网页。`ALIPAY_APP_ID` 为已获权限的应用 ID，`ALIPAY_SELLER_ID` 为对应签约企业的 2088 开头 PID，`ALIPAY_APP_PRIVATE_KEY` 为 PKCS#8 应用私钥，`ALIPAY_PUBLIC_KEY` 为支付宝提供的公钥（不是应用公钥），`ALIPAY_SITE_ORIGIN` 为 `https://tax.heyaokeji.com`。配置时保留 `ALIPAY_PAY_ENABLED` 为 `false`，并把已核对的 Test2 内部用户 ID 设置为 `ALIPAY_PAY_TEST_USER_ID`（不是用户名）。
3. 经确认后在对应数据库应用 `migrations/0016_alipay_recharge.sql` 并部署网站和收款接口。确认通知地址 `https://tax.heyaokeji.com/api/payments/alipay/notify` 对支付宝可访问，不需要用户登录。支付完成的浏览器返回地址 `/api/payments/alipay/return` 只负责导航，不确认付款。
4. 先在隔离数据库用模拟通知验收。部署后把 `ALIPAY_PAY_ENABLED` 设为 `pilot`，只有 Test2 本人能通过独立按钮下单支付 1 元。由用户本人付款，核对支付宝收银台、商户账单及网站积分流水确实增加 1 积分。不要用模拟回调、变更金额或生产数据库手工加分代替正式验收。
5. `migrations/0017_recharge_amounts.sql` 将两种渠道从固定档位升级为整数金额，同时保留原订单及流水；备份后应用，再发布新代码。设置 `ALIPAY_PAY_ENABLED=true` 向普通客户开放正式档，实际可付款额度仍由商户和支付渠道规则决定。未实付的收银台验证不证明生产到账已经完成。清空 `ALIPAY_PAY_TEST_USER_ID` 可关闭测试档位；`ALIPAY_PAY_ENABLED=false` 停止所有新单。这些开关不会阻断已发行订单的合法通知，仍需保留支付验签配置。

目前的到账确认依赖支付宝签名异步通知。用户点击「查询到账」会刷新网站订单状态，不会主动向支付宝补查。上线前约定通知最终失败和后台退款的人工对账流程；本次不自动执行退款或积分冲回。

参考：[支付宝电脑网站支付快速接入](https://s.apifox.cn/apidoc/docs-site/3618910/doc-3271411) · [电脑网站支付异步通知](https://developer.alibaba.com/docs/doc.htm?articleId=105902&docType=1&treeId=270)
