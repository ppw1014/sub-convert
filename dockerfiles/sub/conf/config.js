window.config = {
  // 网站标题
  siteName: 'Subconverter Web',
  // API 地址
  apiUrl: '',
  // 短域名服务地址
  shortUrl: 'https://s.ops.ci',
  // 默认远程配置地址
  defaultRemoteConfig: 'config/loyalsoldier_whitelist.ini',
  // 首页菜单
  menuItem: [
    {
      title: '首页',
      link: '/',
      target: '',
    },
    {
      title: 'GitHub',
      link: 'https://github.com/stilleshan/subweb',
      target: '_blank',
    },
  ],
  // 远程配置地址,可以自行按照格式添加。
  remoteConfigOptions: [
    {
      value: 'config/loyalsoldier_whitelist.ini',
      text: 'Loyalsoldier 白名单',
    },
    {
      value: 'config/loyalsoldier_shadowrocket.ini',
      text: 'Loyalsoldier Shadowrocket',
    },
    {
      value: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online.ini',
      text: 'ACL4SSR Online',
    },
    {
      value: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Full.ini',
      text: 'ACL4SSR Online Full',
    },
  ],
};
