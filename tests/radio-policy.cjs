const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),esbuild=require('esbuild');
const moduleContext={module:{exports:{}},URL};moduleContext.exports=moduleContext.module.exports;
vm.runInNewContext(esbuild.buildSync({entryPoints:['web/radio-policy.js'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text,moduleContext);
const policy=moduleContext.module.exports;
module.exports=policy;
if(require.main===module){
 const stations=policy.searchStations(),first=stations[0],second=stations[1];
 assert.equal(stations.length,2);assert.equal(policy.searchStations('97.5')[0].id,first.id);assert.equal(policy.searchStations('未知海外电台').length,0);
 assert.equal(policy.approvedStation({id:'unreviewed',name:first.name,url:first.url}),null);
 const changed=policy.approvedStation({id:first.id,name:'forged',url:'https://evil.test/live.mp3'});
 assert.equal(changed.url,first.url);assert.equal(changed.name,first.name);assert.ok(Object.isFrozen(changed));
 assert.equal(policy.approvedStation({id:first.legacyIds[0]}).id,first.id);
 assert.equal(policy.approvedResource(first,first.url),true);
 assert.equal(policy.approvedResource(first,first.url.replace('live.m3u8','1792166400000/75513117.ts')),true);
 for(const url of [second.url,'https://evil.test/live.m3u8',first.url.replace('lzlive.vojs.cn','lzlive.vojs.cn.evil.test'),first.url.replace('https:','http:'),first.url+'?url=https://evil.test',first.url+'#x',first.url.replace('/live','/%6cive'),first.url.replace('lzlive.vojs.cn','user:password@lzlive.vojs.cn'),first.url.replace('/92/','/93/'),first.url.replace('live.m3u8','other.m3u8')])assert.equal(policy.approvedResource(first,url),false,url);
 const html=fs.readFileSync('dist/web/index.html','utf8');
 for(const s of stations)assert.ok(html.includes(s.url.replace('live.m3u8','')));
 assert.ok(!html.includes('__RADIO_SOURCES__'));assert.ok(!html.includes('connect-src \'self\' https:;'));
 console.log('PASS reviewed identities, local search, immutable source mapping, legacy migration, HLS origin/path boundaries and built CSP');
}
