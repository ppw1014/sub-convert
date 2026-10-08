# Hako / Clash 移动端启动慢与内存不足诊断

日期：2026-09-09。范围：日志分析、订阅生成链路核对、优化方案与本地实现验证。

## 结论

主要问题集中在 **Loyalsoldier 大规则集的准备和原始格式加载，以及 Hako 的 MRS 编译结果复用路径**。日志已确认内存压力导致连接被主动关闭；最近的启动失败也发生在规则处理期间，随后 VPN 扩展异常退出。内存耗尽是强嫌疑，但不能仅凭扩展退出错误码确认系统 Jetsam 杀进程。

优先方案是新增 Mihomo / Hako 移动端模板，将同一来源、同一版本的规则提前在服务端编译成 MRS，保留分流顺序和代理节点。仓库已落地这条服务端路径；真机对照仍需在部署后完成。

## 分析基线

- 用户确认模板：`Loyalsoldier 白名单`。日志中的订阅参数也包含 `config/loyalsoldier_whitelist.ini` 和 `expand=false`。
- 本地代码：`main`，commit `2ae0625365bc29f88798198e69450343f79492ed`。开始分析时工作区干净。
- 日志：[hako-logs-2026-09-09-2047.log](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log)，92,989 行；按 `core` / `app` 两段分别处理，再按时间关联。正文时间统一为北京时间。
- 日志 SHA-256：`17f8a28f72b4bde6348a80d2f5a258c7578685576b82b2c0cc6f8c6b52875bf5`。
- 日志包含 Hako build `0903-1301`、`0906-2335`、`0909-0152`。不能假定全部记录来自同一客户端版本。
- 当前上游规则量是 2026-09-09 21:07 从模板指定 CDN 获取并用 YAML 解析器统计的结果，不等同于手机历史缓存的准确版本。
- 尝试只读获取日志中的订阅成品，连接失败；对转换服务的 HTTP 探测也超时。因此没有取得手机实际导入 YAML 的完整快照，未核实线上容器对应的 Git commit。
- 文档不记录订阅令牌、节点密码或完整订阅 URL。

## 证据与定位

### 1. 十多秒主要消耗在规则准备阶段

9 月 9 日 20:40 的一次完整失败链路：

| 阶段 | 时间 / 耗时 | 证据 |
| --- | --- | --- |
| 请求激活配置 | 20:40:03.709 | 日志 L92469 |
| 配置激活内部统计 | 289 ms；11 个 provider 全部复用，下载 0 个，provider 部分仅 16 ms | L92474 |
| 规则暂存完成 | 20:40:13.277；`compile=false in=9206ms` | L92477 |
| 请求启动 VPN | 20:40:13.348 | L92480 |
| 内核解析配置完成 | 20 ms | L88317 |
| 内存压力 | 加载 provider 时约 40 MiB | L88335 |
| 扩展异常退出 | 20:40:21.675；`code=12` | L92496 |

该次从请求激活到报错共约 17.97 秒，其中约 9.21 秒用于规则暂存，VPN 启动请求之后又等待约 8.33 秒。

9 月 9 日全部统计：`compile=false` 的 12 条暂存记录耗时 8.026-21.637 秒；`compile=true` 的 8 条记录耗时 16.961-34.320 秒。后者包含后台工作，不能把这些耗时全部加到一次启动上。

这说明即使下载缓存命中，Hako 后续的本地规则准备仍可能很慢。不能把所有启动等待解释成订阅服务器或节点网络延迟。

### 2. MRS 路径与原始规则路径呈现明显差异

对 28 次内核启动按 `[Memory] GC pacing armed` 分段：

| 日志中的加载路径 | 次数 | 结果 |
| --- | ---: | --- |
| 10 个 domain / ipcidr provider 显示 `compiled to MRS` | 9 | 都出现 `after applying it`，应用后内存 17.6-31.3 MiB |
| 出现 `staged as source, not compiled on this profile` | 16 | 都未出现 `after applying it`，伴随内存压力 |
| 无远程规则集的 Default Route 配置 | 3 | 都完成配置应用，约 9.8-10.1 MiB |

成功样本：[日志 L47](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log:47) 起显示 MRS；[L92](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log:92) 显示应用后 17.8 MiB，从内核启动到应用完成约 445 ms。

失败样本：20:46:17 的启动在 [L88730](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log:88730) 附近仍显示原始规则暂存；[L88746](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log:88746) 进入 provider 加载时为 17.1 MiB；开始加载 `reject` 后约 2.5 秒触发内存压力，随后扩展退出。

9 月 9 日两次 Default Route 启动，从 `vpn start requested` 到 `connected` 分别为 261 ms 和 199 ms，应用后内存约 10 MiB。它们说明基础隧道能够快速启动，但并不是保留相同节点、相同规则的受控对照，不能作为代理连通性的证明。

该关联很强，但历史记录的规则版本、客户端 build、配置 revision 并未完全固定。旧 build 也存在原始规则路径失败，因此不能直接断言只有最近一次 Hako 升级引入了问题。

### 3. 内存压力确实影响正在使用的连接

日志显示 Hako 的 Go GC 软目标为 `39321600` 字节，即 37.5 MiB；阈值监控配置为 `52428800` 字节，即 50 MiB。这是客户端记录的预算与策略，不能据此声称已测得所有设备统一的系统硬上限。

整个日志共 58 次 `critical pressure`，14 次 `threshold triggered`。其中 4 次分别主动关闭 99、12、39、30 条已跟踪连接，合计 180 条：L11539、L30288、L52380、L72922。这能解释部分访问中断、卡住后重连的体验。

9 月 9 日 10 次带规则配置的 VPN 启动请求均以 `NEVPNConnectionErrorDomain code=12` 结束，启动请求到错误约 8.04-9.39 秒。当天另外两次成功对应 Default Route。

Apple SDK 的 `NEVPNConnection.h` 定义 `12 = NEVPNConnectionErrorPluginFailed`，表示 VPN 插件意外退出，不是专门的 OOM 错误码。日志采样到的最高 footprint 为 43.24 MiB，不能视为真实峰值；缺少 Jetsam / 系统终止记录，最终退出原因仍需真机系统证据。

### 4. 当前规则量足以让原始 YAML 解析成为高风险阶段

主模板的远程规则定义在 [loyalsoldier_whitelist.ini L242](/Users/damien/Projects/sub-convert/dockerfiles/sub/conf/loyalsoldier_whitelist.ini:242)，另有 L10 的 `applications`。

| 规则集 | 当前条目数 | 当前源文件字节数 |
| --- | ---: | ---: |
| reject | 186,402 | 5,368,696 |
| direct | 111,160 | 2,299,594 |
| proxy | 27,087 | 617,580 |
| cncidr | 9,622 | 210,928 |
| 其余 7 个 | 588 | 16,847 |
| 合计 11 个 | 334,859 | 8,513,645，约 8.12 MiB |

`reject` 与 `direct` 合计 297,562 条，占源文件总字节数约 90.1%。源文件大小不是内存占用：解码、临时对象、索引构建和运行期数据可能同时存在。这里未用桌面解析器的 RSS 代替 iOS 扩展内存。

主要源文件 SHA-256：

```text
reject  6fd47654cae15f79fdfefc1820913fe674dcaacde51af31717b9e965dc9b1291
direct  206654921e5364e33eacd864aa3f2de9e6a66e2d99e2b29026d7919856a27fa7
proxy   7eaeab0d50da5001877a7e0a3343d660c60cdb8b546cac2b4b80d4f9cfb92da1
```

当前转换链路确实仍输出 YAML provider：

1. 前端白名单默认 `expand=false`，见 [index.js L41](/Users/damien/Projects/sub-convert/subweb/src/views/home/index.js:41)；用户日志中的实际订阅参数也吻合。
2. 转换器通过 `renderClashScript` 生成 rule-providers，见 [subexport.cpp L705](/Users/damien/Projects/sub-convert/tindy-subconverter/src/generator/config/subexport.cpp:705)。
3. [templates.cpp L489](/Users/damien/Projects/sub-convert/tindy-subconverter/src/generator/template/templates.cpp:489) 使用 `behavior: domain/ipcidr`、原始 `.txt` URL 和 `.yaml` 缓存路径，没有输出 `format: mrs`；省略格式时 Mihomo 默认按 YAML 处理。

因此，`expand=false` 已经生效，但它只避免把全部规则展开到主配置，不能保证客户端免于解析大型 YAML provider。

### 5. Hako 规则准备与缓存发布有独立异常

- 20:41:38.906 发布了 `compile=true` 的结果；20:41:41.620 又发布 `compile=false`，紧接着启动的核心仍使用 source。见 L92556、L92557、L88397。
- 全日志 6 次 `provider staging not published`：包括 `telegramcidr` 路径被判定在容器外，以及暂存文件 `rename` / `lstat` 时文件不存在。
- 最新一次见 [L92958](/Users/damien/Downloads/hako-logs-2026-09-09-2047.log:92958)，目标位于 Hako 自己的 `working/provider-runtime/staged` 目录。

这些记录支持继续排查并发发布、配置 revision 绑定、缓存清理和编译结果选用。日志不足以确认具体是哪一个实现缺陷，不能直接断言“已证明某线程覆盖缓存”。

### 6. 次要项与证据边界

- 日志显示节点数为 4，没有支持“数百个节点同时测速”这一解释；AUTO 的 300 秒测速可后续调优，优先级低于规则加载。
- `Sniffer is closed`，`Geodata Loader mode: memconservative` 已生效，不应把开启这两个现有设置包装成修复。
- 手机日志明确警告 5 条 `PROCESS-NAME` 与 2 条 `PROCESS-PATH-REGEX` 无法匹配；`applications` provider 内的进程规则也被剥离。它们应在移动端删去，但体量很小，不是 30 万条规则压力的主要来源。
- 本地 HEAD 还含后来加入的其他进程规则，说明不能将本地当前模板与手机历史 YAML 视为字节一致。
- 内核段 88,757 行中，87,364 行是 TCP / UDP 连接日志。正常使用可将 `log-level` 降到 `warn`；日志没有证明这些记录全部驻留在扩展内存，不能据此直接认定 16 MB 日志导致 OOM。
- 日志另有订阅下载 `-1009` 网络不可用错误；它影响更新，应单独处理。缓存已命中仍耗时数秒，说明修好下载链路并不能覆盖全部问题。

## 为什么 Shadowrocket 没有同样的问题

仓库对 Shadowrocket 使用专门的模板，通过 [loyalsoldier_shadowrocket.ini L223](/Users/damien/Projects/sub-convert/dockerfiles/sub/conf/loyalsoldier_shadowrocket.ini:223) 的 `DOMAIN-SET` / `RULE-SET` 引用 `surge-rules`。移动端进程规则已剔除，运行时也不经过 Hako 的 provider 暂存、MRS 编译与 Mihomo 加载链路。

这解释了为什么同一批代理节点在两个客户端可能表现不同。Shadowrocket 也引用了大型 `reject` / `direct` 集合，所以不能简单归因于它的规则少。本次没有 Shadowrocket 内存和启动日志，无法给出两者精确的内存差值。

## 优化方案

### P0：先用相同规则验证 MRS 路径

准备一对固定快照：A 为当前 YAML provider 配置，B 只将 10 个 domain / ipcidr provider 换为同源 MRS。代理节点、分组、DNS、内联规则、规则顺序和日志级别保持一致，以便识别格式变更的实际收益。`applications` 不支持 MRS，第一轮对照中保留它的小型 classical provider。

服务端使用固定版本 Mihomo 预编译，例如：

```sh
mihomo convert-ruleset domain yaml direct.yaml direct.mrs
mihomo convert-ruleset domain yaml reject.yaml reject.mrs
mihomo convert-ruleset ipcidr yaml cncidr.yaml cncidr.mrs
```

provider 需要同时指向实际二进制产物、声明 `format: mrs`、使用独立 `.mrs` 缓存路径；只把 `.txt` URL 改后缀或只改 `format` 都不成立。MRS 目前只支持 `domain` / `ipcidr`，依据 [Mihomo 官方文档](https://github.com/MetaCubeX/Meta-Docs/blob/main/docs/config/rule-providers/index.md)。

手机上先验证 Hako 能直接消费 `format: mrs`，且不会再次进入大文件源码解析路径。历史内部编译成功不等于当前 build 的外部 MRS 导入已通过验证。

### P1：在本项目落地专用移动端模板

已实现：

- `scripts/build_mobile_rules.sh` 固定 `clash-rules` commit，并用固定版本 Mihomo 生成 10 个 MRS 文件与 `manifest.json`；当前产物总量约 2.5 MB，源规则更新失败时不替换上一版产物。
- `scripts/build_mobile_config.mjs` 从现有白名单 INI 结构化生成移动端基础 YAML，保留 205 条内联规则与 10 个 `domain` / `ipcidr` provider；桌面端进程规则和 `applications` classical provider 不下发。
- `dockerfiles/sub/conf/loyalsoldier_mihomo_mobile.ini`、转换器基础 YAML、前端选项和静态 `mobile-rules/` 已加入构建链路。配置输出声明 `format: mrs`，provider 走 `MANAGED_PREFIX` 指向的公开地址。
- `dockerfiles/sub/start.sh` 与 Compose 已支持 `MANAGED_PREFIX`；未单独设置时兼容回退到 `API_URL`，仍建议明确填写手机可访问的公网根地址。

本地验证结果：完整 Docker 镜像构建成功；临时容器返回约 10.6 KB 的 Clash 配置，包含 10 个 MRS provider 和 205 条规则；10 个 MRS URL 均返回 HTTP 200 且与 manifest 的字节数、SHA-256 一致；Mihomo `-t` 配置校验成功。尚未部署线上或在真实 iPhone/Hako build 上验证启动耗时和内存峰值。

建议沿现有接口实现，不必先改动通用 C++ 规则生成器：

| 位置 | 计划改动 |
| --- | --- |
| `dockerfiles/sub/conf/loyalsoldier_mihomo_mobile.ini` 及现有分发副本 | 新增独立移动端选项，绑定专用 `clash_rule_base`，使用 `enable_rule_generator=false` |
| `tindy-subconverter/base/base/loyalsoldier_mihomo_mobile.yml` | 从现有白名单规则生成主配置，引用预编译 MRS，保留自定义规则顺序和策略 |
| 新增规则构建脚本与产物清单 | 固定源快照，记录条目数、SHA-256、编译器版本，验证成功后整体发布；失败保留上次可用产物 |
| `subweb/public/conf/config.js`、`dockerfiles/sub/conf/config.js` | 增加“Loyalsoldier Mihomo 移动端”选项 |
| `Dockerfile.local-sub`、`dockerfiles/sub/start.sh` | 打包专用模板与规则产物，通过现有静态服务提供可下载的 `.mrs` 文件 |

这一接入方式已有代码支持：外部配置可指定 `clash_rule_base`；[subexport.cpp L702](/Users/damien/Projects/sub-convert/tindy-subconverter/src/generator/config/subexport.cpp:702) 在关闭规则生成器时仍输出模板与生成的代理节点、分组。构建脚本应从现有规则源结构化生成移动端配置，避免再手工维护一份数百行自定义规则。

发布的规则地址需要在 VPN 尚未连接时可达。订阅更新与规则更新使用固定快照、独立缓存路径和可回退版本，手机启动优先消费已准备好的本地缓存。服务端定期更新，避免把规则编译绑定到手机每次启动。

### P2：在 MRS 对照通过后做移动端精简

- 删除 `applications` 与全部进程匹配规则，保留微信 / 腾讯直连域名和 AI 代理规则。
- 正常模式 `log-level: warn`；诊断期间按需恢复 `info`。
- 明确关闭不需要的 LAN 代理入口；DNS 与 IPv6 设置依据 Hako 的有效配置做兼容验证，避免修改多个变量掩盖主因。
- 保留现有节点选择；只有测到测速引起波动，再调整 AUTO 周期或默认选择。4 个节点不是本次优先删减对象。
- `reject` 精简或关闭作为单独可选版本，它会改变广告拦截行为，不作为保持语义方案的默认步骤。
- `proxy` 虽然与最终 `MATCH,PROXY` 目标相同，但它位于 `direct` 之前，可能影响重叠域名；`cncidr` 与 `GEOIP,CN` 数据来源也不保证一致。删除前必须验证分流等价性。

### Hako 客户端需要继续核查的部分

本仓库只能降低输入成本，以下问题需要 Hako 实现或其维护者处理：

- 编译结果按规则内容哈希、behavior、format、编译器版本缓存，并与配置 revision 对应。
- 同一配置激活合并重复任务；后台旧结果不能替换当前 revision 的结果。
- 文件暂存、发布和清理的生命周期，避免正在读取或重命名时被删除。
- 大规则的编译在主 App 完成；扩展启动读取已准备的运行产物。
- 新增每个 provider 的输入大小、准备时间、内存前后值、缓存命中原因，便于定位具体规则集与阶段。

这些是基于日志的核查方向，尚未做 Hako 源码审查。本轮不会通过调高内存保护阈值处理问题。

## 验收与下一步

先固定同一台手机、同一个 Hako build、节点与规则源快照，比较 A / B。B 通过后再加入 P2 精简，分别计量导入 / 更新耗时、激活到 connected、VPN 请求到 connected、应用后内存和启动峰值。

建议验收目标，均尚未实测达成：

- 已有缓存时，激活配置到 VPN connected 的 P95 小于 3 秒。
- 10 次进程冷启动与 10 次热启动全部成功，无 `code=12` 和启动期内存保护；首次下载另计。
- 启动后的扩展 footprint 争取不超过 25 MiB，常用负载下保留至少约 10 MiB 的预算余量；峰值以真机测量为准。
- 原始 YAML / MRS 的代表性域名与 IP 命中结果一致，重点覆盖 AI、微信多媒体、国内站点、广告、Telegram、局域网和兜底流量。
- 缓存存在而规则源暂时不可达时仍能启动；Wi-Fi / 蜂窝切换、锁屏恢复及 20 分钟实际使用不出现内存保护导致的集中断连。
- 若仍退出，采集同一时刻的 Jetsam / 系统终止诊断，结合 provider 分阶段内存指标确认最终原因。

本轮已完成静态代码核对、全日志统计、Apple SDK 错误码核对、官方 MRS 格式核对、当前规则源规模测量，以及本地完整镜像和临时容器验证。没有修改线上服务；真实 iPhone/Hako 的启动耗时、内存峰值和 `code=12` 是否消失仍待部署后验证。
