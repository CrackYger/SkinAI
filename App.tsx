
import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCcw, CheckCircle2, ChevronRight, Activity, Droplets, Sparkles, Shield, User, Info, Check, Plus, Edit2, Save, Trash2, ArrowRight, ArrowLeft, Heart, BarChart3, TrendingUp, Calendar, Minus, ChevronDown, Download, Upload, Bell, Moon, Sun, Wind, CloudSun, Smile, Frown, Zap, Trophy, Flame, Package, Image as ImageIcon, Loader2, AlertTriangle, Trash } from 'lucide-react';
import { AppStep, QuizData, SkinAnalysis, ScanStep, RoutineStep, DailyProgress, UserSettings, WeatherData, ScannedProduct } from './types';
import { AppleCard, PrimaryButton, SecondaryButton } from './components/AppleCard';
import { analyzeSkin, getRealtimeWeather, analyzeProduct } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('welcome');
  const [loadingMsg, setLoadingMsg] = useState('Analysiere...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [images, setImages] = useState<{ [key: string]: string }>({});
  const [scanIndex, setScanIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  
  const [quizStep, setQuizStep] = useState(0);
  const [quiz, setQuiz] = useState<QuizData>({
    age: '', concerns: [], lifestyle: '', sunExposure: '', sensitivity: '', waterIntake: '', sleepHours: ''
  });
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  
  const [waterAmount, setWaterAmount] = useState(1.5);
  const [sleepAmount, setSleepAmount] = useState(7.5);
  const [stressLevel, setStressLevel] = useState(3);
  const [skinComfort, setSkinComfort] = useState(8);
  
  const [settings, setSettings] = useState<UserSettings>({
    darkMode: false, notifications: true, userName: 'Glow User', skinTypeGoal: 'Glass Skin', 
    isSetupComplete: false, points: 0, streak: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // Laden der Daten aus LocalStorage beim Start
  useEffect(() => {
    const saved = localStorage.getItem('glow_skincare_data');
    if (saved) {
      try {
        const { settings: s, analysis: a } = JSON.parse(saved);
        if (s) setSettings(s);
        if (a) setAnalysis(a);
        if (s?.isSetupComplete) setStep('care');
      } catch (e) { console.error("Restore failed", e); }
    }
  }, []);

  // Automatisches Speichern bei Änderungen
  useEffect(() => {
    if (settings.isSetupComplete) {
      localStorage.setItem('glow_skincare_data', JSON.stringify({ settings, analysis }));
    }
  }, [settings, analysis]);

  const scanSteps: ScanStep[] = [
    { label: 'Frontal', instruction: 'Gesicht zentriert halten.', id: 'front' },
    { label: 'Linkes Profil', instruction: 'Drehe deinen Kopf nach links.', id: 'left' },
    { label: 'Rechtes Profil', instruction: 'Drehe deinen Kopf nach rechts.', id: 'right' }
  ];

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const data = await getRealtimeWeather(pos.coords.latitude, pos.coords.longitude);
          setWeather(data);
        } catch (e) { }
      });
    }
  }, []);

  useEffect(() => {
    if (['scan', 'daily_scan', 'product_scan'].includes(step)) {
      startCamera();
      const timer = setTimeout(() => setIsScanning(true), 1500);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
      setIsScanning(false);
      setScanProgress(0);
    }
  }, [step]);

  useEffect(() => {
    if (isScanning && (step === 'scan' || step === 'daily_scan')) startProgress();
    else stopProgress();
  }, [isScanning, scanIndex]);

  const startProgress = () => {
    setScanProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          captureImage();
          return 0;
        }
        return prev + 1.2;
      });
    }, 40);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { 
      setErrorMsg("Kamera konnte nicht gestartet werden.");
      setStep('analyzing');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        
        if (step === 'daily_scan') {
           setStep('analyzing');
           setLoadingMsg("Tages-Check...");
           setTimeout(() => setStep('care'), 1500);
           return;
        }

        if (step === 'product_scan') {
          setLoadingMsg("Produkt wird geprüft...");
          setStep('analyzing');
          try {
            const res = await analyzeProduct(dataUrl, quiz);
            setScannedProduct(res);
            setStep('product_result');
          } catch (e: any) { 
            setErrorMsg(e.message === "API_KEY_MISSING" ? "Bitte API_KEY in Vercel hinterlegen!" : "Analyse fehlgeschlagen.");
            setStep('analyzing');
          }
          return;
        }

        const currentId = scanSteps[scanIndex].id;
        setImages(prev => ({ ...prev, [currentId]: dataUrl }));

        if (scanIndex < scanSteps.length - 1) {
          setScanIndex(prev => prev + 1);
        } else {
          setIsScanning(false);
          setStep('quiz');
        }
      }
    }
  };

  const handleQuizSubmit = async () => {
    setErrorMsg(null);
    setLoadingMsg("KI berechnet deine Routine...");
    setStep('analyzing');
    try {
      const result = await analyzeSkin(images, quiz, weather || undefined, (msg) => setLoadingMsg(msg));
      setAnalysis(result);
      setSettings(prev => ({...prev, isSetupComplete: true, points: prev.points + 150, streak: prev.streak + 1}));
      setStep('result');
    } catch (err: any) { 
      setErrorMsg(err.message === "API_KEY_MISSING" ? "API_KEY fehlt in den Vercel Einstellungen!" : (err.message || "Analyse fehlgeschlagen."));
    }
  };

  const resetAll = () => {
    if (confirm("Alle Daten löschen?")) {
      localStorage.removeItem('glow_skincare_data');
      window.location.reload();
    }
  };

  return (
    <div className={`min-h-screen max-w-md mx-auto px-6 py-12 flex flex-col transition-all duration-700 ${settings.darkMode ? 'bg-black text-white' : 'bg-[#f5f5f7] text-zinc-900'}`}>
      <header className="mb-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'} rounded-2xl flex items-center justify-center shadow-2xl transition-transform hover:scale-110 active:scale-95`}>
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">GlowAI</h1>
        </div>
        {settings.isSetupComplete && (
           <button onClick={() => setStep('profile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${settings.darkMode ? 'bg-zinc-800' : 'bg-white'} shadow-sm border border-zinc-100`}>
             <User className="w-5 h-5" />
           </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-32 no-scrollbar">
        {step === 'welcome' && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-1000">
            <div className="relative rounded-[48px] overflow-hidden aspect-[4/5] shadow-2xl group border-4 border-white">
              <img src="https://images.unsplash.com/photo-1596462502278-27bfad450516?auto=format&fit=crop&q=80&w=800" className="w-full h-full object-cover" alt="Hero" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-12">
                <h2 className="text-5xl font-black text-white mb-4 leading-[0.9] tracking-tighter">Perfect Skin.<br/><span className="text-zinc-400">Measured.</span></h2>
                <p className="text-white/80 text-lg leading-tight font-medium">Hautanalyse per 3D-Scan und KI-Routine.</p>
              </div>
            </div>
            <PrimaryButton dark={settings.darkMode} onClick={() => setStep('scan')}>Analyse starten</PrimaryButton>
          </div>
        )}

        {(['scan', 'daily_scan', 'product_scan'].includes(step)) && (
          <div className="space-y-10 animate-in fade-in duration-500 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight">
                {step === 'daily_scan' ? 'Daily Check' : step === 'product_scan' ? 'Produkt-Scan' : scanSteps[scanIndex].label}
              </h2>
              <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-[0.3em] animate-pulse">
                {step === 'product_scan' ? 'Produkt mittig platzieren' : scanSteps[scanIndex].instruction}
              </p>
            </div>
            <div className="relative aspect-square w-full max-w-[320px] mx-auto group">
              <svg className="absolute inset-[-24px] w-[calc(100%+48px)] h-[calc(100%+48px)] rotate-[-90deg]">
                <circle cx="50%" cy="50%" r="48%" className="stroke-zinc-100 fill-none" strokeWidth="4" />
                <circle cx="50%" cy="50%" r="48%" className="stroke-black fill-none transition-all duration-100" strokeWidth="4" strokeDasharray="100 100" strokeDashoffset={100 - scanProgress} strokeLinecap="round" pathLength="100" />
              </svg>
              <div className="relative w-full h-full rounded-full overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] border-8 border-white z-10 bg-zinc-50">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className="absolute top-0 left-0 w-full h-1 bg-black/20 scan-anim z-20"></div>
              </div>
            </div>
            {step === 'product_scan' && (
              <div className="pt-4">
                <PrimaryButton dark={settings.darkMode} onClick={captureImage} className="w-auto px-16 mx-auto rounded-full">Scan auslösen</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'quiz' && (
          <div className="space-y-10 animate-in slide-in-from-right duration-700">
            <div className="flex items-center justify-between mb-4">
               <div className={`h-1 flex-1 ${settings.darkMode ? 'bg-zinc-800' : 'bg-zinc-200'} rounded-full overflow-hidden mr-6`}>
                  <div className={`h-full ${settings.darkMode ? 'bg-white' : 'bg-black'} transition-all duration-700`} style={{ width: `${((quizStep + 1) / 7) * 100}%` }}></div>
               </div>
               <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{quizStep + 1} / 7</span>
            </div>
            {quizStep === 0 && <QuizOption dark={settings.darkMode} title="Wie alt bist du?" options={['18-24', '25-34', '35-44', '45+']} selected={quiz.age} onSelect={v => { setQuiz({...quiz, age: v}); setQuizStep(1); }} />}
            {quizStep === 1 && (
              <div className="space-y-8">
                <h2 className="text-4xl font-black tracking-tighter leading-none">Deine Ziele?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {['Unreinheiten', 'Anti-Aging', 'Glow', 'Große Poren', 'Trockenheit', 'Augenringe'].map(goal => (
                    <button key={goal} onClick={() => setQuiz(p => ({...p, concerns: p.concerns.includes(goal) ? p.concerns.filter(c => c !== goal) : [...p.concerns, goal]}))} className={`py-6 rounded-[28px] text-[10px] font-black uppercase tracking-widest transition-all ${quiz.concerns.includes(goal) ? 'bg-black text-white shadow-xl scale-105' : 'bg-white border text-zinc-400'}`}>
                      {goal}
                    </button>
                  ))}
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={() => setQuizStep(2)} disabled={quiz.concerns.length === 0}>Weiter</PrimaryButton>
              </div>
            )}
            {quizStep >= 2 && quizStep <= 5 && (
              <QuizOption 
                dark={settings.darkMode} 
                title={[
                  "Empfindlichkeit?", "Sonnenbad?", "Wasser?", "Schlaf?"
                ][quizStep-2]} 
                options={[
                  ['Robust', 'Normal', 'Sensibel', 'Sehr sensibel'],
                  ['Nie', 'Gelegentlich', 'Oft', 'Täglich'],
                  ['< 1L', '1-2L', '2-3L', '3L+'],
                  ['< 5h', '5-7h', '7-8h', '9h+']
                ][quizStep-2]}
                selected={[quiz.sensitivity, quiz.sunExposure, quiz.waterIntake, quiz.sleepHours][quizStep-2]}
                onSelect={v => {
                  const keys = ['sensitivity', 'sunExposure', 'waterIntake', 'sleepHours'];
                  setQuiz({...quiz, [keys[quizStep-2]]: v});
                  setQuizStep(quizStep + 1);
                }} 
              />
            )}
            {quizStep === 6 && (
              <div className="space-y-8 animate-in fade-in">
                <h2 className="text-4xl font-black tracking-tighter leading-none">Stresslevel?</h2>
                <div className="space-y-4">
                  {['Niedrig', 'Moderat', 'Hoch', 'Extrem'].map(l => (
                    <button key={l} onClick={() => setQuiz({...quiz, lifestyle: l})} className={`w-full py-7 px-10 rounded-[36px] text-lg font-black transition-all text-left flex justify-between items-center ${quiz.lifestyle === l ? 'bg-black text-white translate-x-3 shadow-2xl' : 'bg-white border hover:bg-zinc-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={handleQuizSubmit} disabled={!quiz.lifestyle}>Analyse starten</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-12 animate-in fade-in">
            {!errorMsg ? (
              <>
                <div className="relative w-48 h-64 rounded-[48px] overflow-hidden shadow-[0_48px_80px_-16px_rgba(0,0,0,0.2)] border-4 border-white bg-zinc-100">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-black shadow-[0_0_24px_black] scan-anim"></div>
                  <Loader2 className="w-10 h-10 animate-spin absolute inset-0 m-auto text-zinc-300" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight">{loadingMsg}</h2>
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">GlowAI Engine v3.1</p>
                </div>
              </>
            ) : (
              <div className="space-y-8 max-w-xs">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black">Fehler</h2>
                  <p className="text-red-700/60 text-xs font-bold uppercase tracking-widest">{errorMsg}</p>
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={handleQuizSubmit}>Erneut versuchen</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'result' && analysis && (
          <div className="space-y-12 animate-in slide-in-from-bottom-10 duration-1000">
             <div className="text-center pt-8">
               <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.4em] mb-4 block">Haut-Vitalität</span>
               <div className="text-[140px] font-black leading-none tracking-tighter transition-all hover:scale-105 cursor-default">{analysis.overallScore}</div>
               <p className="bg-black text-white px-10 py-3.5 rounded-full font-black text-[11px] uppercase tracking-[0.2em] inline-block shadow-2xl mt-4">{analysis.skinType}</p>
             </div>
             <RoutineManager dark={settings.darkMode} analysis={analysis} />
             <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Dashboard öffnen</PrimaryButton>
          </div>
        )}

        {step === 'care' && (
           <div className="space-y-12 animate-in fade-in duration-700">
             <div className="flex justify-between items-end">
               <div>
                 <h2 className="text-5xl font-black tracking-tighter">Health</h2>
                 <p className="text-zinc-500 font-black uppercase text-[11px] tracking-[0.3em] mt-1">Live Tracking</p>
               </div>
               <div className="text-right flex flex-col items-end gap-2">
                 <div className="flex items-center gap-2 bg-yellow-400/10 text-yellow-600 px-4 py-2 rounded-2xl border border-yellow-400/20">
                    <Trophy className="w-4 h-4" />
                    <span className="text-xs font-black">{settings.points}</span>
                 </div>
                 <div className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-2xl shadow-lg shadow-orange-500/20">
                    <Flame className="w-4 h-4" />
                    <span className="text-xs font-black">{settings.streak}d</span>
                 </div>
               </div>
             </div>
             
             <div className="grid grid-cols-2 gap-5">
                <button onClick={() => setStep('daily_scan')} className="p-10 rounded-[48px] bg-white shadow-2xl border border-zinc-100 flex flex-col items-center gap-5 active:scale-95 transition-all group">
                  <div className="p-5 bg-zinc-50 rounded-3xl group-hover:bg-zinc-100 transition-colors">
                    <Camera className="w-8 h-8" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Face Scan</span>
                </button>
                <button onClick={() => setStep('product_scan')} className="p-10 rounded-[48px] bg-black text-white shadow-2xl flex flex-col items-center gap-5 active:scale-95 transition-all group">
                  <div className="p-5 bg-white/10 rounded-3xl group-hover:bg-white/20 transition-colors">
                    <Package className="w-8 h-8" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Produkt Scan</span>
                </button>
             </div>
             
             <AppleCard dark={settings.darkMode} className="space-y-10">
                <h3 className="text-xl font-black tracking-tight">Daily Balance</h3>
                <SliderItem icon={<Zap className="text-yellow-500" />} label="Stress" value={stressLevel} max={10} min={1} onChange={setStressLevel} dark={settings.darkMode} />
                <SliderItem icon={<Smile className="text-green-500" />} label="Hautgefühl" value={skinComfort} max={10} min={1} onChange={setSkinComfort} dark={settings.darkMode} />
             </AppleCard>

             <div className="grid grid-cols-2 gap-5">
                <TrackerMini dark={settings.darkMode} icon={<Droplets className="text-blue-500" />} label="Hydration" value={waterAmount} unit="L" onInc={() => setWaterAmount(v => Number((v + 0.25).toFixed(2)))} onDec={() => setWaterAmount(v => Math.max(0, Number((v - 0.25).toFixed(2))))} />
                <TrackerMini dark={settings.darkMode} icon={<Moon className="text-indigo-500" />} label="Rest" value={sleepAmount} unit="h" onInc={() => setSleepAmount(v => v + 0.5)} onDec={() => setSleepAmount(v => Math.max(0, v - 0.5))} />
             </div>
           </div>
        )}

        {step === 'product_result' && scannedProduct && (
          <div className="space-y-10 animate-in slide-in-from-bottom-10 duration-700">
            <div className="relative aspect-square w-full rounded-[60px] overflow-hidden shadow-2xl border-4 border-white bg-zinc-50">
              <img src={scannedProduct.imageUrl} className="w-full h-full object-cover" alt={scannedProduct.name} />
              <div className="absolute top-8 right-8 bg-black/80 backdrop-blur-xl px-6 py-3 rounded-[24px] flex items-center gap-3 border border-white/20 shadow-2xl">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span className="text-white font-black text-2xl">{scannedProduct.rating}<span className="text-xs opacity-50">/10</span></span>
              </div>
            </div>
            <div className="space-y-3 text-center">
              <h2 className="text-4xl font-black leading-[0.85] tracking-tighter">{scannedProduct.name}</h2>
              <div className={`px-6 py-2 rounded-full font-black text-[11px] uppercase tracking-widest inline-block shadow-sm ${scannedProduct.suitability === 'Sehr gut' ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                {scannedProduct.suitability}
              </div>
            </div>
            <AppleCard dark={settings.darkMode} className="space-y-4">
              <h3 className="font-black text-lg">Eignung für dich</h3>
              <p className="text-zinc-500 text-sm leading-relaxed font-medium">{scannedProduct.personalReason}</p>
            </AppleCard>
            <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Zurück</PrimaryButton>
          </div>
        )}

        {step === 'profile' && (
          <div className="space-y-12 animate-in slide-in-from-right duration-500">
             <div className="flex flex-col items-center pt-10 text-center space-y-6">
               <div className="w-32 h-32 bg-white rounded-[56px] flex items-center justify-center shadow-2xl border-4 border-white overflow-hidden ring-4 ring-zinc-50">
                 <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${settings.userName}`} className="w-full h-full" alt="Avatar" />
               </div>
               <div>
                <h2 className="text-4xl font-black tracking-tight">{settings.userName}</h2>
                <p className="text-xs text-zinc-400 font-black uppercase tracking-[0.3em] mt-1">{settings.skinTypeGoal}</p>
               </div>
             </div>
             <div className="space-y-6">
                <AppleCard dark={settings.darkMode} className="!p-0 overflow-hidden">
                   <SettingsItem dark={settings.darkMode} icon={<Bell className="text-blue-500" />} label="Push-Erinnerungen" value={settings.notifications} onToggle={() => setSettings(p => ({...p, notifications: !p.notifications}))} />
                   <SettingsItem dark={settings.darkMode} icon={<Moon className="text-indigo-500" />} label="Dark Appearance" value={settings.darkMode} onToggle={() => setSettings(p => ({...p, darkMode: !p.darkMode}))} isLast />
                </AppleCard>
                <div className="pt-10">
                  <SecondaryButton dark={settings.darkMode} onClick={resetAll} className="!bg-red-50 !text-red-500 flex items-center justify-center gap-3 border border-red-100">
                    <Trash className="w-5 h-5" /> Alle Daten löschen
                  </SecondaryButton>
                </div>
             </div>
          </div>
        )}
      </div>

      <footer className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 transition-all duration-700 ${!settings.isSetupComplete ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
        <div className={`${settings.darkMode ? 'bg-zinc-900/80 border-white/5' : 'bg-white/80 border-zinc-100'} backdrop-blur-2xl border flex justify-around p-3 rounded-[36px] shadow-2xl z-50`}>
          <NavButton dark={settings.darkMode} icon={<BarChart3 />} label="Health" active={step === 'care'} onClick={() => setStep('care')} />
          <NavButton dark={settings.darkMode} icon={<Shield />} label="Routine" active={step === 'result'} onClick={() => setStep('result')} />
          <NavButton dark={settings.darkMode} icon={<Activity />} label="Scan" active={['scan', 'daily_scan', 'product_scan'].includes(step)} onClick={() => setStep('daily_scan')} />
          <NavButton dark={settings.darkMode} icon={<User />} label="Profil" active={step === 'profile'} onClick={() => setStep('profile')} />
        </div>
      </footer>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// Hilfskomponenten
const RoutineManager: React.FC<{ analysis: SkinAnalysis, dark: boolean }> = ({ analysis, dark }) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5">
    <div className="space-y-5">
      <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.4em] px-6">Morning Ritual</h4>
      <div className="grid grid-cols-1 gap-4">
        {analysis.morningRoutine?.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
      </div>
    </div>
    <div className="space-y-5">
      <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.4em] px-6">Evening Ritual</h4>
      <div className="grid grid-cols-1 gap-4">
        {analysis.eveningRoutine?.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
      </div>
    </div>
  </div>
);

const RoutineCard: React.FC<{ step: RoutineStep, dark: boolean }> = ({ step, dark }) => (
  <div className={`flex items-center rounded-[32px] overflow-hidden shadow-sm border transition-all hover:shadow-xl hover:-translate-y-1 ${dark ? 'bg-zinc-900 border-white/5' : 'bg-white border-zinc-100'}`}>
    <div className="w-28 h-28 flex-shrink-0 bg-zinc-50">
      <img src={step.imageUrl || 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400'} className="w-full h-full object-cover" alt={step.product} />
    </div>
    <div className="p-6 flex-1 min-w-0">
      <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">{step.action}</p>
      <h5 className="text-base font-black truncate leading-tight mb-1">{step.product}</h5>
      <p className="text-[11px] text-zinc-500 line-clamp-1 font-medium">{step.reason}</p>
    </div>
    <ChevronRight className="w-5 h-5 mr-6 text-zinc-200" />
  </div>
);

const QuizOption: React.FC<{ title: string, options: string[], selected: string, onSelect: (v: string) => void, dark: boolean }> = ({ title, options, selected, onSelect, dark }) => (
  <div className="space-y-10 animate-in slide-in-from-right-10 duration-700">
    <h2 className="text-5xl font-black leading-[0.85] tracking-tighter">{title}</h2>
    <div className="grid grid-cols-1 gap-4">
      {options.map(opt => (
        <button key={opt} onClick={() => onSelect(opt)} className={`py-7 px-10 rounded-[40px] text-left text-xl font-black transition-all ${selected === opt ? 'bg-black text-white translate-x-3 shadow-2xl scale-105' : 'bg-white border text-zinc-900 border-zinc-100 hover:border-zinc-300'}`}>
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const TrackerMini: React.FC<{ icon: React.ReactNode, label: string, value: number, unit: string, onInc: () => void, onDec: () => void, dark: boolean }> = ({ icon, label, value, unit, onInc, onDec, dark }) => (
  <div className={`p-6 flex flex-col gap-6 border rounded-[40px] shadow-sm transition-all hover:shadow-md ${dark ? 'bg-zinc-900 border-white/5' : 'bg-white border-zinc-100'}`}>
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-2xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
    </div>
    <div className="flex items-center justify-between">
      <button onClick={onDec} className={`w-10 h-10 rounded-full ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center active:scale-75 transition-transform`}><Minus className="w-5 h-5" /></button>
      <div className="text-2xl font-black tracking-tighter">{value}<span className="text-[11px] text-zinc-400 ml-1 font-bold">{unit}</span></div>
      <button onClick={onInc} className={`w-10 h-10 rounded-full ${dark ? 'bg-white text-black' : 'bg-black text-white'} flex items-center justify-center active:scale-75 transition-transform shadow-lg shadow-black/10`}><Plus className="w-5 h-5" /></button>
    </div>
  </div>
);

const SliderItem: React.FC<{ icon: React.ReactNode, label: string, value: number, max: number, min: number, onChange: (v: number) => void, dark: boolean }> = ({ icon, label, value, max, min, onChange, dark }) => (
  <div className="space-y-5">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
        <span className="text-[11px] font-black uppercase tracking-[0.2em]">{label}</span>
      </div>
      <span className="text-2xl font-black tracking-tighter">{value}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-100 rounded-full appearance-none accent-black cursor-pointer" />
  </div>
);

const SettingsItem: React.FC<{ icon: React.ReactNode, label: string, value: boolean, onToggle: () => void, isLast?: boolean, dark: boolean }> = ({ icon, label, value, onToggle, isLast, dark }) => (
  <div className={`flex items-center justify-between p-7 ${!isLast ? (dark ? 'border-b border-white/5' : 'border-b border-zinc-50') : ''}`}>
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 rounded-2xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
      <span className="text-base font-black tracking-tight">{label}</span>
    </div>
    <button onClick={onToggle} className={`w-14 h-8 rounded-full relative transition-all duration-300 ${value ? (dark ? 'bg-white' : 'bg-black') : 'bg-zinc-200'}`}>
      <div className={`absolute top-1.5 w-5 h-5 rounded-full transition-all duration-300 ${value ? 'left-8' : 'left-1.5'} ${value && dark ? 'bg-black' : 'bg-white'}`}></div>
    </button>
  </div>
);

const NavButton: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void, dark: boolean }> = ({ icon, label, active, onClick, dark }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all flex-1 py-1 ${active ? (dark ? 'text-white' : 'text-black') : 'text-zinc-400 opacity-60'}`}>
    <div className={`p-2.5 rounded-2xl transition-all ${active ? (dark ? 'bg-white/10' : 'bg-black/5') : ''}`}>{React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}</div>
    <span className="text-[9px] font-black uppercase tracking-[0.3em]">{label}</span>
  </button>
);

export default App;
