using System;
using System.IO;
using System.Linq;
using System.Media;
using System.Diagnostics;
using System.Threading;
using Nexus;

internal static class SpectrumTests
{
    static void Assert(bool value,string message){if(!value)throw new Exception(message);}
    static byte[] Tone(double hz,int bits,bool floating,int channels,int frames,double amplitude) {
        var bytes=new byte[frames*channels*(bits/8)];
        for(int i=0;i<frames;i++)for(int c=0;c<channels;c++){
            double value=Math.Sin(2*Math.PI*hz*i/48000)*amplitude*(c%2==0?1:-1);int p=(i*channels+c)*(bits/8);
            byte[] sample=floating?BitConverter.GetBytes((float)value):bits==16?BitConverter.GetBytes((short)(value*32767)):BitConverter.GetBytes((int)(value*2147483647));
            Buffer.BlockCopy(sample,bits==24?1:0,bytes,p,bits/8);
        }return bytes;
    }
    static int Peak(double[] bands){return Array.IndexOf(bands,bands.Max());}
    static void Main(string[] args){try{
        if(args.Length>0&&args[0]=="--emit"){
            var pcm=Tone(Double.Parse(args[1]),16,false,2,48000*3,.035);
            using(var memory=new MemoryStream()) {var writer=new BinaryWriter(memory);writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));writer.Write(36+pcm.Length);writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));writer.Write(16);writer.Write((short)1);writer.Write((short)2);writer.Write(48000);writer.Write(192000);writer.Write((short)4);writer.Write((short)16);writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));writer.Write(pcm.Length);writer.Write(pcm);memory.Position=0;using(var player=new SoundPlayer(memory))player.PlaySync();}return;
        }
        foreach(int channels in new[]{1,2,6})foreach(int bits in new[]{16,24,32})foreach(double hz in new[]{93.75,750,6000}){
            var analyzer=new SpectrumAnalyzer(48000,channels);var bytes=Tone(hz,bits,false,channels,4096,.04);analyzer.Append(bytes,4096,channels*bits/8,bits,false,false);
            var frame=analyzer.Analyze(1);int expected=(int)Math.Floor(Math.Log(hz/40,400)*32);
            Assert(Math.Abs(Peak(frame.bands)-expected)<=1,"FFT peak mismatch "+hz+" / "+bits+" / "+channels);
            Assert(Math.Abs(frame.rms-.04/Math.Sqrt(2))<.001,"RMS mismatch (including opposite-phase channels)");
            analyzer.Clear();Assert(analyzer.Analyze(1).rms==0,"Clear retained audio");
        }Console.WriteLine("PASS 27 PCM frequency/channel cases, anti-phase stereo, RMS and reset");
        var floats=new SpectrumAnalyzer(48000,2);floats.Append(Tone(1500,32,true,2,4096,.02),4096,8,32,true,false);Assert(floats.Analyze(.5).rms>.006&&floats.Analyze(.5).rms<.008,"Float or gain mismatch");
        floats.Append(new byte[0],4096,8,32,true,true);Assert(floats.Analyze(1).rms==0,"Silent packet retained spectrum");Console.WriteLine("PASS float32, volume gain and WASAPI silence");
        if(args.Length>0&&args[0]=="--live") {
            using(var capture=AudioLoopback.Acquire()){
                var same=AudioLoopback.Acquire();Assert(Object.ReferenceEquals(capture,same),"Not shared across subscribers");same.Dispose();
                foreach(int hz in new[]{750,6000}){
                    var info=new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location,"--emit "+hz){UseShellExecute=false,CreateNoWindow=true};
                    using(var sound=Process.Start(info)){
                        var watch=Stopwatch.StartNew();bool found=false;
                        while(watch.ElapsedMilliseconds<4500){var frame=capture.Latest;int expected=(int)Math.Floor(Math.Log(hz/40.0,400)*32);if(frame.rms>.00015&&Math.Abs(Peak(frame.bands)-expected)<=1){found=true;break;}Thread.Sleep(40);}
                        Assert(found,"Real output loopback missed "+hz+" Hz: "+capture.Latest.status+" rms="+capture.Latest.rms);sound.WaitForExit();
                    }
                }
                Thread.Sleep(500);Assert(capture.Latest.rms<.00015,"Silence did not decay after external player exit");
                Console.WriteLine("PASS actual external-process playback -> shared WASAPI loopback -> frequency detection -> silence");
            }
            Thread.Sleep(300);using(var restart=AudioLoopback.Acquire()){Thread.Sleep(500);Assert(restart.Latest.sequence>0,"Loopback did not restart");}
            Console.WriteLine("PASS release and restart capture lifecycle");
        }
    }catch(Exception e){Console.Error.WriteLine(e);Environment.ExitCode=1;}}
}
