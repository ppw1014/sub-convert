# sub

GitHub [stilleshan/dockerfiles](https://github.com/stilleshan/dockerfiles)
Docker [stilleshan/sub](https://hub.docker.com/r/stilleshan/sub)
> *docker image support for X86 and ARM*

## 简介
基于 subweb 和定制 subconverter 前后端加上 myurls 短链接整合容器，支持本地规则配置和 Shadowrocket 输出。

## 部署
本目录的 Compose 配置使用仓库内构建的 `local/subweb-loyalsoldier:latest`，不要替换成上游 `stilleshan/sub`，否则会丢失本仓库的规则和 Hysteria2/Shadowrocket 补丁。

### docker
> 已更新支持短链接,如需要更换短链接或自己部署,请使用以下 docker compose 部署.
```shell
docker run -d --name sub --restart unless-stopped \
  -p 18080:80 \
  --env-file /PATH/sub/.env \
  -v /PATH/sub/conf:/usr/share/nginx/html/conf \
  -v /PATH/sub/conf:/base/config \
  local/subweb-loyalsoldier:latest
```
先按 `.env.example` 创建本地 `.env`，其中 `SUBSCRIPTION_URL_ENCODED` 是合并订阅的完整 URL 编码值。该文件含订阅凭据，已被根仓库忽略。

修改挂载路径，根据需求自行修改 `conf/config.js` 中的相关配置。

推荐使用`nginx`配置域名反向代理至`18080`端口.

`subconverter`同样支持挂载外部配置文件,参考容器内部路径:`/base/snippets/rulesets.txt`.

### docker compose
docker compose 已包含 myurl 短链接:
- 如无需部署 myurls 服务,可删除`12-32`行,将默认使用本站短链接.也可以修改`conf/config.js`来使用其他`myurls`短链接服务.
- 如需自行部署 myurls 服务,需修改`docker-compose.yml`中的`MYURLS_DOMAIN`,以及`conf/config.js`中的`shortUrl`,注意请严格按照示例格式填写.
- myurls 服务需要单独配置 nginx 反代以及证书,可以参考`myurls.conf`配置.注意需要修改`域名`,`证书路径`,`日志路径`.
在本仓库中执行以下命令启动（Compose 会读取同目录 `.env`）：
```shell
docker-compose up -d
```

## 参考
- [stilleshan/subweb](https://github.com/stilleshan/subweb)
- [stilleshan/subconverter](https://github.com/stilleshan/subconverter)
