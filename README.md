# sub-ops

`sub-ops` 是当前订阅转换服务的统一源码和部署仓库，包含 Subweb、定制 Subconverter、Docker 配置以及 Clash/Shadowrocket 规则。

## 目录

- `subweb/`：订阅转换前端和随前端发布的规则配置。
- `tindy-subconverter/`：支持 Hysteria2 与 Shadowrocket 输出的转换器源码补丁。
- `subconverter/`：Subconverter 镜像配置。
- `dockerfiles/sub/`：当前一体化服务的启动脚本、Compose 文件和运行规则。
- `scripts/build_mobile_rules.sh`：按固定 `clash-rules` commit 生成 Mihomo 移动端 MRS 规则包。
- `Dockerfile.subconverter-patched`：构建定制转换器镜像。
- `Dockerfile.local-sub`：构建前端与转换器一体化镜像。
- `UPSTREAMS.md`：四个上游仓库的来源和基线 commit。

## 构建与运行

```bash
docker build -t local/subconverter-patched:hy2 -f Dockerfile.subconverter-patched .
docker build -t local/subweb-loyalsoldier:latest -f Dockerfile.local-sub .
cd dockerfiles/sub
docker compose up -d subconverter
```

Compose 从 `dockerfiles/sub/.env` 读取本地参数。可参考同目录的 `.env.example`；`SUBSCRIPTION_URL_ENCODED` 应为合并后的完整 URL 编码值，多条订阅之间的 `|` 应编码为 `%7C`。`.env`、订阅成品和数据库均不会进入 Git。

## 规则维护

Clash 的主配置为 `dockerfiles/sub/conf/loyalsoldier_whitelist.ini`，Shadowrocket 的主配置为 `dockerfiles/sub/conf/loyalsoldier_shadowrocket.ini`。同名文件还会同步到前端和转换器构建目录，修改后必须保持内容一致。

- 微信与腾讯全量直连规则已内置于主配置中：Clash 包含 Mihomo 支持的桌面进程匹配（`PROCESS-NAME` / `PROCESS-PATH-REGEX`）与多媒体 CDN 域名，Shadowrocket 移动端下发全量直连域名规则。
- Claude、OpenAI、Google 等指定代理域名的 QUIC（UDP 443）在 Clash 主配置中被显式 `REJECT`，使客户端回落到 TCP；其他域名、端口与实时音视频 UDP 不受这条规则影响。该规则不保证账户风控结果。逻辑规则（`AND` / `OR` / `NOT`）仅 mihomo 内核支持，Shadowrocket 配置不下发；转换器 `transformRuleToCommon` 对逻辑规则做直通处理，防止按逗号拆分改写规则。
- 基础模板 `tindy-subconverter/base/base/all_base.tpl` 针对 Clash 输出默认配置了 `ipv6: false`，避免下游客户端在无可用公网 IPv6 环境下因 Happy Eyeballs 双栈竞争超时导致图片与多媒体加载卡顿。
- `Loyalsoldier Mihomo 移动端（MRS）` 使用预编译规则，需先运行 `MIHOMO_BIN=/path/to/mihomo scripts/build_mobile_rules.sh`；它是独立选项，不改变默认白名单模板。
- 部署移动端配置时设置 `MANAGED_PREFIX` 为手机可访问的公网根地址（例如 `https://sub.example.com`），否则 MRS provider URL 会回退到转换器默认地址。

## Clash Verge：节点与规则分开管理

订阅只提供节点；本仓库的 `dockerfiles/sub/conf/loyalsoldier_whitelist.ini` 是所有订阅共用的规则源。更新规则后运行：

```bash
node scripts/build_clash_verge.mjs
node scripts/check_clash_verge.mjs
node scripts/build_mobile_config.mjs
```

生成器同步四份 INI，并生成 `generated/clash-verge.js`。Clash Verge 的“全局扩展脚本”（macOS 默认位置为 `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/profiles/Script.js`）可使用指向此文件的符号链接，避免维护另一份规则副本。生成后在订阅页点击“重新激活订阅”。订阅自己的规则、分组增强保持为空；订阅自己的合并配置不得再次覆盖 `rules`、`rule-providers` 或 `proxy-groups`。

脚本原样保留订阅节点，根据当前订阅生成 `PROXY` 和 `AUTO`，不引用固定节点、国家分组或 `GEMINI`。`PROXY` 首项是订阅首个节点，手动选定后保持出口；`AUTO` 是可选项，存在其他协议时不纳入 SOCKS5/HTTP 节点。AI 与 Antigravity 统一走 `PROXY`，国内及局域网保持直连。使用符号链接时，修改仓库规则只需重新生成、重新激活；订阅刷新只更新节点。
