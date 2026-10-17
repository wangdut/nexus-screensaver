import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist/web',{recursive:true});
await Promise.all(['style.css','radio.css'].map(file=>copyFile(`web/${file}`,`dist/web/${file}`)));
await copyFile('src/nexus.ico','dist/web/nexus.ico');

const catalog=JSON.parse(await readFile('config/radio-allowlist.json','utf8'));
const sources=[...new Set(catalog.stations.map(s=>s.url.slice(0,s.url.lastIndexOf('/')+1)))].join(' ');
await writeFile('dist/web/index.html',(await readFile('web/index.html','utf8')).replace('__RADIO_SOURCES__',sources));
