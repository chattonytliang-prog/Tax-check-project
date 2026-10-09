# 微信支付接入与上线检查

本次只接入普通商户 Native 扫码支付。固定 200 元（20000 分）兑换 200 积分。
支付宝静态收款仍为人工核验，不会根据用户点击或截图自动加分。

## 服务端配置

在 Cloudflare Pages 对应项目的生产环境配置，不使用 VITE_ 前缀。
密钥不得发到聊天、提交 GitHub 或放进 public。私钥使用 PKCS#8 PEM。

| 配置项 | 内容 |
| --- | --- |
| WECHAT_MCH_ID | 商户号，不是登录账号 |
| WECHAT_APP_ID | 已与商户号绑定的 AppID |
| WECHAT_CERT_SERIAL | 商户 API 证书序列号 |
| WECHAT_PRIVATE_KEY | 商户 apiclient_key.pem 内容（Secret） |
| WECHAT_API_V3_KEY | 32 字节 APIv3 密钥（Secret） |
| WECHAT_PUBLIC_KEY_ID | 微信支付公钥 ID，PUB_KEY_ID_ 开头 |
| WECHAT_PUBLIC_KEY | 对应微信支付公钥 PEM |
| WECHAT_NOTIFY_URL | https://tax.heyaokeji.com/api/payments/wechat/notify |
| WECHAT_PAY_ENABLED | 默认不设置；完成检查后才设为 true |

当前使用微信支付公钥模式，不支持用平台证书 PEM 替代公钥。轮换时同步更新公钥 ID 和公钥。
商户平台必须已开通 Native 支付，AppID 绑定关系必须有效。

## 发布顺序

1. 审查代码与测试，提交并推送 GitHub main，确认远端提交；由 Cloudflare Git 自动部署。
2. 用户确认生产数据库升级，先备份，再执行 migrations/0011_wechat_recharge.sql。
   此迁移仅新增订单、充值流水和触发器，不重建现有积分流水表。
3. 配置上述密钥，检查回调路径不被登录、WAF 或机器人验证拦截。
4. 启用开关并重新部署。由用户本人确认并完成真实付款测试，核对微信交易、订单、
   充值流水和余额；重复查询/通知只能增加一次 200 积分。
5. 再验证关闭页面后支付、通知重试、查询补单和积分流水展示。

## 安全与运维

- 金额和积分只由服务端决定。验签后解密通知，核对商户、AppID、订单、币种和金额。
- 订单变为 paid、插入充值流水、增加钱包余额由 SQLite 触发器原子完成。
- 回调数据库失败返回非成功状态，不能先应答成功再异步写积分。查单也可以补偿到账。
- 禁用开关停止新下单，已有订单仍可验签回调和查询补单。若已有未结订单，不要删除
  密钥或更换商户配置；先核对交易和未结订单，避免收款后不到账。
- 暂不实现退款/自动扣款。退款应人工核对未使用积分和交易后再处理；不要直接在商户平台
  退款而不核对网站积分。上线前确认售后联系人、充值规则和退款处理流程。
- 上游超时不代表付款失败。已付款用户不能被引导重复支付。
- 不能宣称真实支付联调完成，直到用户实际付款并核对到账。

参考：[Native 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791877)、
[支付通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791861)。
