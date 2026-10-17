import catalog from '../config/radio-allowlist.json';

export const reviewedOn=catalog.reviewedOn;
const stations=catalog.stations.map(s=>Object.freeze({...s,legacyIds:Object.freeze([...s.legacyIds])}));
const byId=new Map(stations.flatMap(s=>[s.id,...s.legacyIds].map(id=>[id,s])));

// Saved data identifies a station; it can never supply a playback URL or display name.
export function approvedStation(value){return value&&typeof value.id==='string'?byId.get(value.id)||null:null;}
export function searchStations(query=''){
  const terms=String(query).trim().toLocaleLowerCase().slice(0,64).split(/\s+/).filter(Boolean);
  return stations.filter(s=>terms.every(t=>[s.name,s.broadcaster,s.frequency,s.tags].join(' ').toLocaleLowerCase().includes(t)));
}
export function approvedResource(station,url){
  const s=approvedStation(station);if(!s||typeof url!=='string'||/[%\\]/.test(url))return false;
  try{
    const target=new URL(url),source=new URL(s.url);
    if(target.origin!==source.origin||target.username||target.password||target.search||target.hash)return false;
    const prefix=source.pathname.slice(0,source.pathname.lastIndexOf('/')+1);
    return target.pathname.startsWith(prefix)&&/^(?:live\.m3u8|\d+\/\d+\.ts)$/.test(target.pathname.slice(prefix.length));
  }catch{return false;}
}
