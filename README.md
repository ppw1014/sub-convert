# sub-ops

`sub-ops` 是当前订阅转换服务的统一源码和部署仓库，包含 Subweb、定制 Subconverter、Docker 配置以及 Clash/Shadowrocket 规则。

## 目录

- `subweb/`：订阅转换前端和随前端发布的规则配置。
- `tindy-subconverter/`：支持 Hysteria2 与 Shadowrocket 输出的转换器源码补丁。
- `subconverter/`：Subconverter 镜像配置。
- `dockerfiles/sub/`：当前一体化服务的启动脚本、Compose 文件和运行规则。
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
- Claude/Anthropic 域名的 QUIC（UDP 443）在 Clash 主配置中被显式 `REJECT`：逼浏览器回落 TCP，让 Claude 流量保持单一代理出口，避免代理 IP 与直连真实 IP 混源触发 Anthropic 风控。逻辑规则（`AND` / `OR` / `NOT`）仅 mihomo 内核支持，Shadowrocket 配置不下发；转换器 `transformRuleToCommon` 对逻辑规则做直通处理，防止按逗号拆分改写规则。
- 基础模板 `tindy-subconverter/base/base/all_base.tpl` 针对 Clash 输出默认配置了 `ipv6: false`，避免下游客户端在无可用公网 IPv6 环境下因 Happy Eyeballs 双栈竞争超时导致图片与多媒体加载卡顿。
