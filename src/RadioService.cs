using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Nexus
{
    // Same reviewed catalog is bundled into the web player and embedded in the Windows binary.
    internal static class RadioService
    {
        static readonly List<Dictionary<string,object>> stations=Load();
        static List<Dictionary<string,object>> Load(){
            using(var input=typeof(RadioService).Assembly.GetManifestResourceStream("Nexus.RadioAllowlist.json")){
                if(input==null)throw new InvalidDataException("Missing radio allowlist.");
                using(var reader=new StreamReader(input)){
                    var json=new JavaScriptSerializer();
                    var data=json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
                    if(Convert.ToInt32(data["schemaVersion"])!=1)throw new InvalidDataException("Unsupported radio allowlist.");
                    return json.ConvertToType<List<Dictionary<string,object>>>(data["stations"]);
                }
            }
        }
        internal static Task<object> Search(string query){
            query=(query??"").Trim();if(query.Length>64)query=query.Substring(0,64);
            var terms=query.Split(new[]{' ','\t','\r','\n'},StringSplitOptions.RemoveEmptyEntries);
            return Task.FromResult<object>(stations.Where(s=>terms.All(t=>
                String.Join(" ",new[]{Text(s,"name"),Text(s,"broadcaster"),Text(s,"frequency"),Text(s,"tags")})
                .IndexOf(t,StringComparison.OrdinalIgnoreCase)>=0)).ToArray());
        }
        internal static Task<object> Resolve(string id){
            var station=stations.FirstOrDefault(s=>Text(s,"id")==id);
            if(station==null)throw new InvalidOperationException("该电台未列入已核验白名单。");
            return Task.FromResult<object>(station);
        }
        internal static bool AllowsResource(string url){
            if(String.IsNullOrEmpty(url)||url.Contains("%")||url.Contains("\\"))return false;
            Uri target;if(!Uri.TryCreate(url,UriKind.Absolute,out target)||target.Scheme!="https"||!target.IsDefaultPort||target.UserInfo.Length>0||target.Query.Length>0||target.Fragment.Length>0)return false;
            foreach(var station in stations){
                var source=new Uri(Text(station,"url"));var prefix=source.AbsolutePath.Substring(0,source.AbsolutePath.LastIndexOf('/')+1);
                if(target.Host==source.Host&&target.AbsolutePath.StartsWith(prefix,StringComparison.Ordinal)&&
                    Regex.IsMatch(target.AbsolutePath.Substring(prefix.Length),@"\A(?:live\.m3u8|[0-9]+/[0-9]+\.ts)\z"))return true;
            }
            return false;
        }
        static string Text(Dictionary<string,object> item,string key){return Convert.ToString(item[key]);}
    }
}
