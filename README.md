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

`clash_wechat_fix.patch` 中的微信进程名和域名直连规则已前置到两套规则中，Clash 配置还包含 Mihomo 支持的 `PROCESS-PATH-REGEX`。补丁中的 DNS、fake-ip 和嗅探设置会改变所有 Clash 流量的解析行为，因此未作为微信规则启用。
