import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mem: Record<string,string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v; },
  removeItem: (k: string) => { delete mem[k]; },
};
import {buildSeedState} from '../src/storage/store';
import App from '../src/App';

// 直接预置种子存储（SSR 不触发 useEffect），再把受阻依赖 lodash 排到首位
const seed = buildSeedState();
mem['license-lens-security-v1'] = JSON.stringify(seed);
const persisted = JSON.parse(mem['license-lens-security-v1']);
const lodash = persisted.deps.find((d: any) => d.name === 'lodash');
persisted.deps = [lodash, ...persisted.deps.filter((d: any) => d.name !== 'lodash')];
mem['license-lens-security-v1'] = JSON.stringify(persisted);

const html = renderToStaticMarkup(React.createElement(App));
const must = ['依赖安全公告处置台', '发布受阻', '规则 R1', '原值', 'affectedRange=', 'fixedVersion='] ;
for (const token of must) {
  if (!html.includes(token)) {
    console.error('missing render token: ' + token);
    process.exit(1);
  }
}
console.log('SSR smoke ok, bytes=' + html.length);
