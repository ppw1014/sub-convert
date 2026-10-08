import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'dockerfiles/sub/conf/loyalsoldier_whitelist.ini');
const outputPath = process.env.MOBILE_CONFIG_OUTPUT || path.join(root, 'tindy-subconverter/base/base/loyalsoldier_mihomo_mobile.yml');
const input = fs.readFileSync(inputPath, 'utf8');

const rules = [];
const seenRules = new Set();
const providers = new Map();

function addRule(rule) {
  if (!seenRules.has(rule)) {
    seenRules.add(rule);
    rules.push(rule);
  }
}

for (const line of input.split(/\r?\n/)) {
  const match = line.match(/^ruleset=([^,]+),(.+)$/);
  if (!match) continue;

  const [, policy, source] = match;
  if (source.startsWith('[]PROCESS-')) continue;

  if (source.startsWith('clash-classic:')) continue;
  if (source.startsWith('clash-domain:') || source.startsWith('clash-ipcidr:')) {
    const fileName = source.slice(source.indexOf('https://')).split('/').pop();
    const name = fileName.replace(/\.txt(?:,\d+)?$/, '');
    const behavior = source.startsWith('clash-ipcidr:') ? 'ipcidr' : 'domain';
    providers.set(name, { behavior, policy });
    addRule(`RULE-SET,${name},${policy}`);
    continue;
  }

  const body = source.startsWith('[]') ? source.slice(2) : source;
  if (/^(AND|OR|NOT),/.test(body)) {
    addRule(`${body},${policy}`);
    continue;
  }

  const parts = body.split(',');
  if (parts.length === 1) {
    addRule(`${parts[0]},${policy}`);
  } else {
    addRule(`${parts[0]},${parts[1]},${policy}${parts[2] === 'no-resolve' ? ',no-resolve' : ''}`);
  }
}

const lines = [
  'port: 7890',
  'socks-port: 7891',
  'allow-lan: false',
  'mode: Rule',
  'log-level: warning',
  'ipv6: false',
  'external-controller: 127.0.0.1:9090',
  'proxies: ~',
  'proxy-groups: ~',
  'rule-providers:',
];

for (const [name, provider] of providers) {
  lines.push(`  ${name}:`);
  lines.push('    type: http');
  lines.push(`    behavior: ${provider.behavior}`);
  lines.push('    format: mrs');
  lines.push(`    url: '{{ getLink("/mobile-rules/${name}.mrs") }}'`);
  lines.push(`    path: ./providers/loyalsoldier-mobile-${name}.mrs`);
  lines.push('    interval: 86400');
}

lines.push('rules:');
for (const rule of rules) lines.push(`  - ${JSON.stringify(rule)}`);
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Generated ${rules.length} mobile rules and ${providers.size} MRS providers`);
