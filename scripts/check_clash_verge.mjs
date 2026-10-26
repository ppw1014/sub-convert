import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = fs.readFileSync(path.join(root, 'generated/clash-verge.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(script, context);
const apply = config => JSON.parse(JSON.stringify(context.main(config)));

// Reproduce the stale subscription/group mismatch with unrelated node sets.
for (const names of [['home-main', 'home-backup'], ['bwg-jp', 'bwg-us']]) {
  const proxies = names.map(name => ({ name, type: 'anytls', udp: false }));
  proxies.push({ name: 'slow-socks', type: 'socks5' });
  const result = apply({ proxies, rules: ['MATCH,JP'], 'proxy-groups': [{ name: 'GEMINI', proxies: ['removed-node'] }] });
  assert.deepEqual(result.proxies, proxies, 'Rules must not inject or alter nodes');
  const groups = result['proxy-groups'];
  assert.deepEqual(groups.map(group => group.name), ['PROXY', 'AUTO', 'GOOGLE-AI']);
  assert.equal(groups[0].proxies[0], names[0], 'Manual selection must default to the subscription first node');
  assert(!groups[1].proxies.includes('slow-socks'), 'SOCKS must not win automatic selection');
  assert(!JSON.stringify(groups).includes('removed-node'));
  assert(!result.rules.some(rule => /,(?:JP|US|GEMINI)(?:,|$)/.test(rule)));
  assert(result.rules.includes('DOMAIN-SUFFIX,antigravity.google,GOOGLE-AI'));
  assert(result.rules.includes('DOMAIN-SUFFIX,daily-cloudcode-pa.googleapis.com,GOOGLE-AI'));
  assert(result.rules.includes('DOMAIN-SUFFIX,gemini.google.com,GOOGLE-AI'));
  assert.deepEqual(groups[2].proxies, ['PROXY']);
  assert(result.rules.includes('DOMAIN-SUFFIX,chatgpt.com,PROXY'));
  assert(result.rules.includes('DOMAIN-SUFFIX,anthropic.com,PROXY'));
  const rejects = result.rules.filter(rule => rule.startsWith('AND,') && rule.endsWith(',REJECT'));
  assert.equal(rejects.length, 1);
  assert(rejects[0].includes('(DST-PORT,443)') && rejects[0].includes('(DOMAIN-SUFFIX,claude.ai)'));
  assert(!rejects[0].includes('8443'), 'Do not block all UDP 8443');
  assert.equal(result.rules.at(-1), 'MATCH,PROXY');
}
const separate = apply({
  proxies: [{ name: 'home-main', type: 'anytls' }],
  'proxy-providers': { 'bwg-jp': { type: 'file', path: './private-bwg.yaml' }, airport: { type: 'file', path: './airport.yaml' } },
});
assert.deepEqual(separate['proxy-groups'][2].use, ['bwg-jp']);
for (const group of separate['proxy-groups'].slice(0, 2)) {
  assert.deepEqual(group.use, ['airport'], 'Ordinary traffic must not select the dedicated BWG provider');
}
assert(!separate['proxy-groups'][2].proxies, 'Dedicated Google traffic must not fall back to home');
// Mobile templates receive their groups from a separate INI, not the Verge script.
const mobileIni = fs.readFileSync(path.join(root, 'dockerfiles/sub/conf/loyalsoldier_mihomo_mobile.ini'), 'utf8');
const mobileGroups = new Set(['DIRECT', 'REJECT', ...[...mobileIni.matchAll(/^custom_proxy_group=([^`]+)`/gm)].map(match => match[1])]);
const mobileYaml = fs.readFileSync(path.join(root, 'tindy-subconverter/base/base/loyalsoldier_mihomo_mobile.yml'), 'utf8');
for (const line of mobileYaml.split('\nrules:\n')[1].trim().split('\n')) {
  const parts = JSON.parse(line.trim().slice(2)).split(',');
  const policy = parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1);
  assert(mobileGroups.has(policy), `Mobile rule references undefined group: ${policy}`);
}
console.log('PASS: shared routes preserve subscription nodes; Google AI uses the isolated BWG provider when configured');
