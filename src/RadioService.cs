using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;

namespace Nexus
{
    internal static class RadioService
    {
        static readonly HttpClient client=CreateClient();
        static readonly string[] fallback={"de1.api.radio-browser.info","de2.api.radio-browser.info","nl1.api.radio-browser.info"};
        static string[] servers;
        static HttpClient CreateClient(){ServicePointManager.SecurityProtocol|=SecurityProtocolType.Tls12;var c=new HttpClient();c.Timeout=TimeSpan.FromSeconds(7);c.DefaultRequestHeaders.UserAgent.ParseAdd("NEXUS-Screensaver/"+typeof(RadioService).Assembly.GetName().Version.ToString(3));return c;}
        static async Task<string[]> Servers(){if(servers!=null)return servers;try{var json=await client.GetStringAsync("https://all.api.radio-browser.info/json/servers");var list=Preferences.Json.Deserialize<List<Dictionary<string,object>>>(json);servers=list.Select(x=>Convert.ToString(x["name"])).Where(x=>x.EndsWith(".api.radio-browser.info",StringComparison.OrdinalIgnoreCase)&&Uri.CheckHostName(x)==UriHostNameType.Dns).OrderBy(x=>Guid.NewGuid()).Take(3).ToArray();}catch{}return servers!=null&&servers.Length>0?servers:fallback;}
        static async Task<string> Get(string path){Exception last=null;foreach(var host in await Servers()){try{return await client.GetStringAsync("https://"+host+path);}catch(Exception error){last=error;}}throw new Exception("电台目录暂时不可用，请稍后重试。",last);}
        internal static async Task<object> Search(string query)
        {
            query=(query??"").Trim();if(query.Length>64)query=query.Substring(0,64);
            string filter="&name="+Uri.EscapeDataString(query.Length==0?"音乐":query);
            string json=await Get("/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=80"+filter);
            var list=Preferences.Json.Deserialize<List<Dictionary<string,object>>>(json);
            return list.Select(x=>new {id=Text(x,"stationuuid"),name=Text(x,"name"),url=Text(x,"url_resolved"),tags=Text(x,"tags"),language=Text(x,"language"),country=Text(x,"country"),codec=Text(x,"codec"),hls=Text(x,"hls")=="1"}).Where(x=>x.url.StartsWith("https://",StringComparison.OrdinalIgnoreCase)).GroupBy(x=>x.url).Select(x=>x.First()).OrderByDescending(x=>x.language.Contains("chinese")||x.language.Contains("mandarin")||x.language.Contains("cantonese")).ToArray();
        }
        internal static async Task<object> Resolve(string id){
            Guid parsed;if(!Guid.TryParse(id,out parsed))throw new ArgumentException("Invalid station identifier.");
            var list=Preferences.Json.Deserialize<List<Dictionary<string,object>>>(await Get("/json/stations/byuuid/"+parsed.ToString()));
            var station=list.FirstOrDefault(x=>Text(x,"stationuuid")==parsed.ToString());if(station==null)return null;
            string url=Text(station,"url_resolved");if(url.Length==0)url=Text(station,"url");
            Uri uri;if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||uri.Scheme!=Uri.UriSchemeHttps)return null;
            return new {id=parsed.ToString(),name=Text(station,"name"),url=url,language=Text(station,"language"),tags=Text(station,"tags"),hls=Text(station,"hls")=="1"};
        }
        internal static async Task Click(string id){Guid parsed;if(!Guid.TryParse(id,out parsed))return;try{await Get("/json/url/"+parsed.ToString());}catch{}}
        static string Text(Dictionary<string,object> item,string name){object value;return item.TryGetValue(name,out value)?Convert.ToString(value):"";}
    }
}
