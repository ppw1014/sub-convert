#!/bin/sh
if [ ! -f /usr/share/nginx/html/conf/config.js ]; then
  cp /app/conf/config.js /usr/share/nginx/html/conf
fi

mkdir -p /base/config
for conf_dir in /usr/share/nginx/html/conf /app/conf; do
  [ -d "$conf_dir" ] || continue
  for conf_file in "$conf_dir"/loyalsoldier_*.ini; do
    [ -f "$conf_file" ] || continue
    conf_name="$(basename "$conf_file")"
    if [ ! -f "/base/config/$conf_name" ] || ! cmp -s "$conf_file" "/base/config/$conf_name"; then
      cp "$conf_file" "/base/config/$conf_name"
    fi
  done
done

for pref_file in /base/pref.toml /base/pref.example.toml; do
  [ -f "$pref_file" ] || continue
  sed -i 's/^max_allowed_rulesets = .*/max_allowed_rulesets = 256/' "$pref_file"
done

if [ "$API_URL" ]; then
  echo "当前 API 地址为: $API_URL"
  sed -i "s#apiUrl: ''#apiUrl: '$API_URL'#g" /usr/share/nginx/html/conf/config.js
else
  echo "当前为默认同源 API 地址"
  echo "如需修改请在容器启动时使用 -e API_URL='https://sub.ops.ci' 传递环境变量"
fi

if [ "$SHORT_URL" ]; then
  echo "当前短链接地址为: $SHORT_URL"
  sed -i "s#https://s.ops.ci#$SHORT_URL#g" /usr/share/nginx/html/conf/config.js
fi

if [ "$SITE_NAME" ]; then
  sed -i "s#Subconverter Web#$SITE_NAME#g" /usr/share/nginx/html/conf/config.js
fi

nohup /base/subconverter & echo "启动成功"

init_nginx (){
  if [ -n "${SUBSCRIPTION_URL_ENCODED:-}" ]; then
    case "$SUBSCRIPTION_URL_ENCODED" in
      *[!A-Za-z0-9._~%-]*)
        echo "SUBSCRIPTION_URL_ENCODED 必须是完整的 URL 编码值" >&2
        exit 1
        ;;
    esac
    shadowrocket_proxy_pass="proxy_pass http://127.0.0.1:25500/sub?target=shadowrocket&url=${SUBSCRIPTION_URL_ENCODED}&config=config%2Floyalsoldier_shadowrocket.ini;"
  else
    echo "未配置 SUBSCRIPTION_URL_ENCODED，/shadowrocket.conf 将返回 503"
    shadowrocket_proxy_pass="return 503;"
  fi

  mkdir -p /etc/nginx/http.d
  cat > /etc/nginx/http.d/default.conf <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* /(sub|render|getruleset|surge2clash|getprofile) {
        proxy_redirect off;
        proxy_connect_timeout 180s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
        proxy_pass http://127.0.0.1:25500;
    }

    location = /shadowrocket.conf {
        proxy_redirect off;
        proxy_connect_timeout 180s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
        $shadowrocket_proxy_pass
    }
}
EOF
}

init_nginx

nginx -g "daemon off;"
