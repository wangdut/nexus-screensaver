using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace Nexus
{
    // Windows render-endpoint loopback. No microphone, audio files or network access.
    internal sealed class AudioLoopback : IDisposable
    {
        static readonly object gate = new object();
        static AudioLoopback shared;
        int users;
        readonly ManualResetEvent stop = new ManualResetEvent(false);
        readonly Thread worker;
        internal volatile SpectrumFrame Latest = SpectrumFrame.Empty("connecting", "");
        long serial;
        internal static AudioLoopback Acquire()
        {
            lock(gate) { if(shared==null)shared=new AudioLoopback(); shared.users++; return shared; }
        }
        AudioLoopback() { worker=new Thread(Run){IsBackground=true,Name="NEXUS output analysis"};worker.SetApartmentState(ApartmentState.MTA);worker.Start(); }
        public void Dispose()
        {
            lock(gate) { if(users<=0)return;if(--users==0){if(shared==this)shared=null;stop.Set();} }
        }
        void Publish(SpectrumFrame frame) { frame.sequence=Interlocked.Increment(ref serial);Latest=frame; }
        void Run()
        {
            try {
                while(!stop.WaitOne(0)) {
                    try { Capture(); }
                    catch(Exception) { Publish(SpectrumFrame.Empty("unavailable", "")); }
                    if(stop.WaitOne(1500))break;
                }
            } finally { stop.Dispose(); }
        }
        static void Check(int hr) { if(hr<0)Marshal.ThrowExceptionForHR(hr); }
        static void Release(object value) { if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value); }
        void Capture()
        {
            IMMDeviceEnumerator enumerator=null;IMMDevice device=null;IAudioClient client=null;IAudioCaptureClient capture=null;IAudioEndpointVolume volume=null;
            IntPtr format=IntPtr.Zero;bool started=false;
            try {
                enumerator=(IMMDeviceEnumerator)new MMDeviceEnumerator();Check(enumerator.GetDefaultAudioEndpoint(0,0,out device));
                string deviceId;Check(device.GetId(out deviceId));
                object obj;Guid iid=typeof(IAudioClient).GUID;Check(device.Activate(ref iid,23,IntPtr.Zero,out obj));client=(IAudioClient)obj;
                iid=typeof(IAudioEndpointVolume).GUID;Check(device.Activate(ref iid,23,IntPtr.Zero,out obj));volume=(IAudioEndpointVolume)obj;
                Check(client.GetMixFormat(out format));
                int tag=(ushort)Marshal.ReadInt16(format),channels=(ushort)Marshal.ReadInt16(format,2),rate=Marshal.ReadInt32(format,4),align=(ushort)Marshal.ReadInt16(format,12),bits=(ushort)Marshal.ReadInt16(format,14);
                bool floating=tag==3;
                if(tag==65534) { Guid sub=(Guid)Marshal.PtrToStructure(IntPtr.Add(format,24),typeof(Guid));floating=sub==new Guid("00000003-0000-0010-8000-00aa00389b71");if(!floating&&sub!=new Guid("00000001-0000-0010-8000-00aa00389b71"))throw new NotSupportedException(); }
                else if(tag!=1&&tag!=3)throw new NotSupportedException();
                if(channels<1||channels>32||rate<8000||rate>384000||(floating?bits!=32:bits!=16&&bits!=24&&bits!=32)||align<channels*(bits/8))throw new NotSupportedException();
                Check(client.Initialize(0,0x20000,1000000,0,format,IntPtr.Zero));
                iid=typeof(IAudioCaptureClient).GUID;Check(client.GetService(ref iid,out obj));capture=(IAudioCaptureClient)obj;
                var analyzer=new SpectrumAnalyzer(rate,channels);
                Check(client.Start());started=true;
                byte[] bytes=new byte[align*rate/2];
                var watch=System.Diagnostics.Stopwatch.StartNew();long nextFrame=0,lastPacket=0,nextDeviceCheck=0;
                Publish(SpectrumFrame.Empty("listening", "默认播放设备"));
                while(!stop.WaitOne(8)) {
                    long now=watch.ElapsedMilliseconds;
                    if(now>=nextDeviceCheck) {
                        IMMDevice current=null;
                        try { Check(enumerator.GetDefaultAudioEndpoint(0,0,out current));string id;Check(current.GetId(out id));if(id!=deviceId)return; }
                        finally { Release(current); }
                        nextDeviceCheck=now+1000;
                    }
                    uint packet;Check(capture.GetNextPacketSize(out packet));
                    while(packet>0) {
                        IntPtr data;uint frames,flags;ulong position,qpc;
                        Check(capture.GetBuffer(out data,out frames,out flags,out position,out qpc));
                        try {
                            int length=checked((int)frames*align);
                            bool silent=(flags&2)!=0;
                            if((flags&1)!=0)analyzer.Clear(); // Discontinuity: don't join unrelated samples.
                            if(!silent){if(bytes.Length<length)bytes=new byte[length];Marshal.Copy(data,bytes,0,length);}
                            analyzer.Append(bytes,(int)frames,align,bits,floating,silent);lastPacket=now;
                        } finally { Check(capture.ReleaseBuffer(frames)); }
                        Check(capture.GetNextPacketSize(out packet));
                        if(stop.WaitOne(0))break;
                    }
                    if(now>=nextFrame) {
                        bool muted;float level;Check(volume.GetMute(out muted));Check(volume.GetMasterVolumeLevelScalar(out level));
                        if(now-lastPacket>160||muted||level<.0001f){analyzer.Clear();Publish(SpectrumFrame.Empty("silent","默认播放设备"));}
                        else Publish(analyzer.Analyze(level));
                        nextFrame=now+40;
                    }
                }
            } finally { if(started&&client!=null)try{client.Stop();}catch{}if(format!=IntPtr.Zero)Marshal.FreeCoTaskMem(format);Release(capture);Release(volume);Release(client);Release(device);Release(enumerator); }
        }

        [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator {
            [PreserveSig]int EnumAudioEndpoints(int flow,uint mask,out IntPtr devices);
            [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
        }
        [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice {
            [PreserveSig]int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object result);
            [PreserveSig]int OpenPropertyStore(uint access,out IntPtr store);
            [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
        }
        [ComImport,Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioClient {
            [PreserveSig]int Initialize(int mode,uint flags,long duration,long periodicity,IntPtr format,IntPtr session);
            [PreserveSig]int GetBufferSize(out uint frames);
            [PreserveSig]int GetStreamLatency(out long latency);
            [PreserveSig]int GetCurrentPadding(out uint frames);
            [PreserveSig]int IsFormatSupported(int mode,IntPtr format,out IntPtr closest);
            [PreserveSig]int GetMixFormat(out IntPtr format);
            [PreserveSig]int GetDevicePeriod(out long normal,out long minimum);
            [PreserveSig]int Start();[PreserveSig]int Stop();[PreserveSig]int Reset();[PreserveSig]int SetEventHandle(IntPtr handle);
            [PreserveSig]int GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object result);
        }
        [ComImport,Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioCaptureClient {
            [PreserveSig]int GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong qpc);
            [PreserveSig]int ReleaseBuffer(uint frames);[PreserveSig]int GetNextPacketSize(out uint frames);
        }
        [ComImport,Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume {
            [PreserveSig]int RegisterControlChangeNotify(IntPtr notify);[PreserveSig]int UnregisterControlChangeNotify(IntPtr notify);
            [PreserveSig]int GetChannelCount(out uint count);[PreserveSig]int SetMasterVolumeLevel(float db,IntPtr context);[PreserveSig]int SetMasterVolumeLevelScalar(float value,IntPtr context);
            [PreserveSig]int GetMasterVolumeLevel(out float db);[PreserveSig]int GetMasterVolumeLevelScalar(out float value);
            [PreserveSig]int SetChannelVolumeLevel(uint channel,float db,IntPtr context);[PreserveSig]int SetChannelVolumeLevelScalar(uint channel,float value,IntPtr context);
            [PreserveSig]int GetChannelVolumeLevel(uint channel,out float db);[PreserveSig]int GetChannelVolumeLevelScalar(uint channel,out float value);
            [PreserveSig]int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,IntPtr context);[PreserveSig]int GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
        }
    }
    internal sealed class SpectrumFrame
    {
        public string type="rhythm",source="system",status,device;
        public double[] bands=new double[32];public double rms;public long sequence;
        internal static SpectrumFrame Empty(string status,string device) { return new SpectrumFrame{status=status,device=device}; }
    }
    internal sealed class SpectrumAnalyzer
    {
        const int Size=2048;
        readonly int rate,channels;readonly double[][] ring;
        readonly double[] real=new double[Size],imag=new double[Size],power=new double[Size/2],window=new double[Size];
        int cursor,count;
        internal SpectrumAnalyzer(int sampleRate,int channelCount) { rate=sampleRate;channels=channelCount;ring=new double[channels][];for(int c=0;c<channels;c++)ring[c]=new double[Size];for(int i=0;i<Size;i++)window[i]=.5-.5*Math.Cos(2*Math.PI*i/(Size-1)); }
        internal void Clear() { count=cursor=0;for(int c=0;c<channels;c++)Array.Clear(ring[c],0,Size); }
        internal void Append(byte[] bytes,int frames,int align,int bits,bool floating,bool silent) {
            int step=bits/8;
            for(int f=0;f<frames;f++) { for(int c=0;c<channels;c++) {
                int p=f*align+c*step;double value=0;
                if(!silent) { if(floating)value=BitConverter.ToSingle(bytes,p);else if(bits==16)value=BitConverter.ToInt16(bytes,p)/32768.0;else if(bits==24)value=((bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16)<<8)/2147483648.0;else value=BitConverter.ToInt32(bytes,p)/2147483648.0; }
                ring[c][cursor]=Double.IsNaN(value)||Double.IsInfinity(value)?0:Math.Max(-1,Math.Min(1,value));
            }cursor=(cursor+1)%Size;count=Math.Min(Size,count+1); }
        }
        internal SpectrumFrame Analyze(double gain) {
            var frame=SpectrumFrame.Empty("listening","默认播放设备");if(count<Size)return frame;
            Array.Clear(power,0,power.Length);double squares=0;
            for(int c=0;c<channels;c++) {
                for(int i=0;i<Size;i++){double sample=ring[c][(cursor+i)%Size]*gain;squares+=sample*sample;real[i]=sample*window[i];imag[i]=0;}
                Fft(real,imag);
                for(int i=1;i<Size/2;i++)power[i]+=(real[i]*real[i]+imag[i]*imag[i])/channels;
            }
            frame.rms=Math.Sqrt(squares/(Size*channels));if(frame.rms<.0001)frame.status="silent";
            for(int b=0;b<32;b++) {
                double low=40*Math.Pow(400,b/32.0),high=40*Math.Pow(400,(b+1)/32.0),peak=0;
                if(low>=rate/2.0)continue;
                int first=Math.Max(1,Math.Min(Size/2-1,(int)Math.Round(low*Size/rate))),last=Math.Max(first,Math.Min(Size/2-1,(int)Math.Round(high*Size/rate)));
                for(int i=first;i<=last;i++)peak=Math.Max(peak,power[i]);
                double amplitude=Math.Sqrt(peak)*4/Size;
                frame.bands[b]=Math.Max(0,Math.Min(1,(20*Math.Log10(Math.Max(1e-10,amplitude))+76)/56));
            }
            return frame;
        }
        static void Fft(double[] re,double[] im) {
            int n=re.Length;
            for(int i=1,j=0;i<n;i++){int bit=n>>1;for(;(j&bit)!=0;bit>>=1)j^=bit;j^=bit;if(i<j){double t=re[i];re[i]=re[j];re[j]=t;}}
            for(int len=2;len<=n;len<<=1){double angle=-2*Math.PI/len,wr=Math.Cos(angle),wi=Math.Sin(angle);for(int i=0;i<n;i+=len){double r=1,s=0;for(int j=0;j<len/2;j++){int a=i+j,b=a+len/2;double tr=re[b]*r-im[b]*s,ti=re[b]*s+im[b]*r;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;double nr=r*wr-s*wi;s=r*wi+s*wr;r=nr;}}}
        }
    }
}
