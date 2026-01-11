
import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCcw, CheckCircle2, ChevronRight, Activity, Droplets, Sparkles, Shield, User, Info, Check, Plus, Edit2, Save, Trash2, ArrowRight, ArrowLeft, Heart, BarChart3, TrendingUp, Calendar, Minus, ChevronDown, Download, Upload, Bell, Moon, Sun, Wind, CloudSun, Smile, Frown, Zap, Trophy, Flame, Package, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
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
  
  // Quiz & Analysis states
  const [quizStep, setQuizStep] = useState(0);
  const [quiz, setQuiz] = useState<QuizData>({
    age: '', concerns: [], lifestyle: '', sunExposure: '', sensitivity: '', waterIntake: '', sleepHours: ''
  });
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  
  // Daily Trackers
  const [waterAmount, setWaterAmount] = useState(1.5);
  const [sleepAmount, setSleepAmount] = useState(7);
  const [stressLevel, setStressLevel] = useState(3);
  const [skinComfort, setSkinComfort] = useState(8);
  
  const [progressHistory] = useState<DailyProgress[]>([
    { date: 'Mo', score: 68, stress: 5, skinFeeling: 6 },
    { date: 'Di', score: 72, stress: 3, skinFeeling: 7 },
    { date: 'Mi', score: 71, stress: 4, skinFeeling: 6 },
    { date: 'Do', score: 75, stress: 2, skinFeeling: 8 },
    { date: 'Fr', score: 82, stress: 1, skinFeeling: 9 },
    { date: 'Sa', score: 80, stress: 3, skinFeeling: 8 },
    { date: 'So', score: 85, stress: 2, skinFeeling: 9 },
  ]);

  const [settings, setSettings] = useState<UserSettings>({
    darkMode: false, notifications: true, userName: 'Glow User', skinTypeGoal: 'Glass Skin', 
    isSetupComplete: false, points: 0, streak: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const scanSteps: ScanStep[] = [
    { label: 'Frontal-Ansicht', instruction: 'Halte dein Gesicht ruhig in den Rahmen.', id: 'front' },
    { label: 'Linke Seite', instruction: 'Drehe deinen Kopf langsam nach links.', id: 'left' },
    { label: 'Rechte Seite', instruction: 'Drehe deinen Kopf nun nach rechts.', id: 'right' }
  ];

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const data = await getRealtimeWeather(pos.coords.latitude, pos.coords.longitude);
          setWeather(data);
        } catch (e) { console.error(e); }
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

  const awardPoints = (amount: number) => {
    setSettings(prev => ({ ...prev, points: prev.points + amount }));
  };

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
    } catch (err) { console.error(err); }
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
           awardPoints(50);
           setLoadingMsg("Face Check läuft...");
           setStep('analyzing');
           setTimeout(() => setStep('care'), 1500);
           return;
        }

        if (step === 'product_scan') {
          setLoadingMsg("Analysiere Produkt...");
          setStep('analyzing');
          try {
            const res = await analyzeProduct(dataUrl, quiz);
            setScannedProduct(res);
            setStep('product_result');
            awardPoints(25);
          } catch (e) { 
            setErrorMsg("Produkt-Analyse fehlgeschlagen.");
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
    setLoadingMsg("Starte KI-Hautanalyse...");
    setStep('analyzing');
    try {
      const result = await analyzeSkin(images, quiz, weather || undefined, (msg) => setLoadingMsg(msg));
      setAnalysis(result);
      awardPoints(100);
      setSettings(prev => ({...prev, isSetupComplete: true, streak: prev.streak + 1}));
      setStep('result');
    } catch (err: any) { 
      setErrorMsg(err.message === "API_KEY_MISSING" ? "API_KEY fehlt." : "Analyse fehlgeschlagen.");
    }
  };

  return (
    <div className={`min-h-screen max-w-md mx-auto px-6 py-12 flex flex-col font-sans transition-all duration-700 ${settings.darkMode ? 'bg-black text-white' : 'bg-[#f5f5f7] text-zinc-900'}`}>
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'} rounded-2xl flex items-center justify-center shadow-xl`}>
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black">GlowAI</h1>
        </div>
        {settings.isSetupComplete && (
           <div className="flex items-center gap-3">
             <div className="flex items-center gap-1 bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full">
                <Flame className="w-3 h-3 fill-orange-500" />
                <span className="text-[10px] font-black">{settings.streak}</span>
             </div>
             <button onClick={() => setStep('profile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${settings.darkMode ? 'bg-zinc-800' : 'bg-white'} shadow-sm`}>
               <User className="w-5 h-5" />
             </button>
           </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-32 no-scrollbar">
        {step === 'welcome' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-1000">
            <div className="relative rounded-[48px] overflow-hidden aspect-[4/5] shadow-2xl">
              <img src="https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&q=80&w=800" className="w-full h-full object-cover" alt="Hero" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-12">
                <h2 className="text-5xl font-black text-white mb-4 leading-none tracking-tighter">Deine Haut,<br/><span className="text-zinc-400">perfekt analysiert.</span></h2>
                <p className="text-white/60 text-lg">KI-Routine basierend auf deinem 3D-Gesichtsscan.</p>
              </div>
            </div>
            <PrimaryButton dark={settings.darkMode} onClick={() => setStep('scan')}>3D Scan starten</PrimaryButton>
          </div>
        )}

        {(['scan', 'daily_scan', 'product_scan'].includes(step)) && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center">
              <h2 className="text-3xl font-black mb-2">
                {step === 'daily_scan' ? 'Face Check' : step === 'product_scan' ? 'Produkt Scan' : scanSteps[scanIndex].label}
              </h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
                {step === 'product_scan' ? 'Produkt im Fokus halten' : scanSteps[scanIndex].instruction}
              </p>
            </div>
            <div className="relative aspect-square w-full max-w-[320px] mx-auto">
              <svg className="absolute inset-[-24px] w-[calc(100%+48px)] h-[calc(100%+48px)] rotate-[-90deg]">
                <circle cx="50%" cy="50%" r="48%" className="stroke-zinc-200 fill-none" strokeWidth="4" />
                <circle cx="50%" cy="50%" r="48%" className="stroke-black fill-none transition-all duration-100" strokeWidth="4" strokeDasharray="100 100" strokeDashoffset={100 - scanProgress} strokeLinecap="round" pathLength="100" />
              </svg>
              <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl border-4 border-white z-10">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              </div>
            </div>
            {step === 'product_scan' && (
              <div className="flex justify-center"><button onClick={captureImage} className="p-6 rounded-full bg-black text-white shadow-xl"><Camera /></button></div>
            )}
          </div>
        )}

        {step === 'quiz' && (
          <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
            <div className="flex items-center justify-between mb-4">
               <div className={`h-1.5 flex-1 ${settings.darkMode ? 'bg-zinc-800' : 'bg-zinc-100'} rounded-full overflow-hidden mr-6`}>
                  <div className={`h-full ${settings.darkMode ? 'bg-white' : 'bg-black'} transition-all duration-700`} style={{ width: `${((quizStep + 1) / 7) * 100}%` }}></div>
               </div>
               <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{quizStep + 1} / 7</span>
            </div>
            
            {quizStep === 0 && <QuizOption dark={settings.darkMode} title="Wie alt bist du?" options={['18-24', '25-34', '35-44', '45+']} selected={quiz.age} onSelect={v => { setQuiz({...quiz, age: v}); setQuizStep(1); }} />}
            {quizStep === 1 && (
              <div className="space-y-8">
                <h2 className="text-4xl font-black leading-tight">Ziele?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {['Unreinheiten', 'Anti-Aging', 'Glow', 'Poren', 'Trockenheit', 'Augenringe'].map(goal => (
                    <button key={goal} onClick={() => setQuiz(p => ({...p, concerns: p.concerns.includes(goal) ? p.concerns.filter(c => c !== goal) : [...p.concerns, goal]}))} className={`py-5 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all ${quiz.concerns.includes(goal) ? 'bg-black text-white' : 'bg-white border text-zinc-400'}`}>
                      {goal}
                    </button>
                  ))}
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={() => setQuizStep(2)} disabled={quiz.concerns.length === 0}>Weiter</PrimaryButton>
              </div>
            )}
            {quizStep === 2 && <QuizOption dark={settings.darkMode} title="Empfindlichkeit?" options={['Robust', 'Normal', 'Sensibel', 'Sehr sensibel']} selected={quiz.sensitivity} onSelect={v => { setQuiz({...quiz, sensitivity: v}); setQuizStep(3); }} />}
            {quizStep === 3 && <QuizOption dark={settings.darkMode} title="Sonnenschutz?" options={['Nie', 'Gelegentlich', 'Oft', 'Täglich']} selected={quiz.sunExposure} onSelect={v => { setQuiz({...quiz, sunExposure: v}); setQuizStep(4); }} />}
            {quizStep === 4 && <QuizOption dark={settings.darkMode} title="Wasser?" options={['< 1L', '1-2L', '2-3L', '3L+']} selected={quiz.waterIntake} onSelect={v => { setQuiz({...quiz, waterIntake: v}); setQuizStep(5); }} />}
            {quizStep === 5 && <QuizOption dark={settings.darkMode} title="Schlaf?" options={['< 5h', '5-7h', '7-8h', '9h+']} selected={quiz.sleepHours} onSelect={v => { setQuiz({...quiz, sleepHours: v}); setQuizStep(6); }} />}
            {quizStep === 6 && (
              <div className="space-y-8">
                <h2 className="text-4xl font-black leading-tight">Stress?</h2>
                <div className="space-y-3">
                  {['Niedrig', 'Moderat', 'Hoch', 'Extrem'].map(l => (
                    <button key={l} onClick={() => setQuiz({...quiz, lifestyle: l})} className={`w-full py-6 px-10 rounded-[32px] text-lg font-black transition-all text-left flex justify-between items-center ${quiz.lifestyle === l ? 'bg-black text-white translate-x-3' : 'bg-white border'}`}>
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-10 animate-in fade-in">
            {!errorMsg ? (
              <>
                <div className="relative w-48 h-64 rounded-[40px] overflow-hidden shadow-2xl border-4 border-white">
                  <div className="absolute top-0 left-0 w-full h-1 bg-black shadow-[0_0_20px_black] animate-[analysis-scan_2s_ease-in-out_infinite]"></div>
                  <Loader2 className="w-12 h-12 animate-spin absolute inset-0 m-auto text-zinc-200" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black">{loadingMsg}</h2>
                  <p className="text-zinc-500 text-sm">Deine KI-Analyse wird generiert...</p>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
                <h2 className="text-2xl font-black">Fehler</h2>
                <p className="text-zinc-500 text-sm">{errorMsg}</p>
                <PrimaryButton dark={settings.darkMode} onClick={handleQuizSubmit}>Erneut versuchen</PrimaryButton>
                <SecondaryButton dark={settings.darkMode} onClick={() => setStep('welcome')}>Abbrechen</SecondaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'result' && analysis && (
          <div className="space-y-12 animate-in slide-in-from-bottom-10 duration-1000">
             <div className="text-center pt-8">
               <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 block">Haut-Score</span>
               <div className="text-[140px] font-black leading-none tracking-tighter">{analysis.overallScore}</div>
               <p className="bg-white px-8 py-3 rounded-full font-black text-xs inline-block shadow-sm">{analysis.skinType}</p>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <MetricCard dark={settings.darkMode} icon={<Droplets />} label="Hydration" value={analysis.hydration} color="bg-blue-500" />
               <MetricCard dark={settings.darkMode} icon={<Shield />} label="Reinheit" value={analysis.purity} color="bg-green-500" />
             </div>
             <RoutineManager dark={settings.darkMode} analysis={analysis} />
             <div className="space-y-4">
                <h3 className="text-2xl font-black px-2 flex items-center gap-3"><Sparkles className="w-6 h-6 text-amber-500" /> AI Insights</h3>
                {analysis.tips.map((tip, i) => <ExpandableTip dark={settings.darkMode} key={i} index={i+1} tip={tip} />)}
             </div>
             <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Dashboard öffnen</PrimaryButton>
          </div>
        )}

        {step === 'product_result' && scannedProduct && (
          <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-700">
            <div className="relative aspect-square w-full rounded-[48px] overflow-hidden shadow-2xl border-4 border-white">
              <img src={scannedProduct.imageUrl} className="w-full h-full object-cover" alt={scannedProduct.name} />
              <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <span className="text-white font-black text-lg">{scannedProduct.rating}/10</span>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-black leading-none tracking-tighter">{scannedProduct.name}</h2>
              <p className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest inline-block ${scannedProduct.suitability === 'Sehr gut' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
                Eignung: {scannedProduct.suitability}
              </p>
            </div>
            <AppleCard dark={settings.darkMode} className="space-y-4">
              <h3 className="font-black text-lg">Produkt-Analyse</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{scannedProduct.description}</p>
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">KI-Empfehlung:</p>
                <p className="text-sm font-medium italic">"{scannedProduct.personalReason}"</p>
              </div>
            </AppleCard>
            <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Dashboard</PrimaryButton>
          </div>
        )}

        {step === 'care' && (
           <div className="space-y-10 animate-in fade-in duration-700">
             <div className="flex justify-between items-end">
               <div>
                 <h2 className="text-4xl font-black tracking-tighter">Health</h2>
                 <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest">Live Overview</p>
               </div>
               <div className="text-right flex flex-col items-end">
                 <div className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full mb-1">
                    <Trophy className="w-3 h-3" />
                    <span className="text-[10px] font-black">{settings.points}</span>
                 </div>
                 <div className="flex items-center gap-1 bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full">
                    <Flame className="w-3 h-3" />
                    <span className="text-[10px] font-black">{settings.streak}</span>
                 </div>
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setStep('daily_scan')} className="p-8 rounded-[40px] bg-white shadow-xl flex flex-col items-center gap-4 active:scale-95 transition-all">
                  <Camera className="w-8 h-8" />
                  <span className="text-[10px] font-black uppercase">Face Scan</span>
                </button>
                <button onClick={() => setStep('product_scan')} className="p-8 rounded-[40px] bg-black text-white shadow-xl flex flex-col items-center gap-4 active:scale-95 transition-all">
                  <Package className="w-8 h-8" />
                  <span className="text-[10px] font-black uppercase">Produkt Scan</span>
                </button>
             </div>
             <AppleCard dark={settings.darkMode} className="space-y-8">
                <h3 className="text-lg font-black">Tracking</h3>
                <SliderItem icon={<Zap className="text-yellow-500" />} label="Stress" value={stressLevel} max={10} min={1} onChange={setStressLevel} dark={settings.darkMode} />
                <SliderItem icon={<Smile className="text-green-500" />} label="Komfort" value={skinComfort} max={10} min={1} onChange={setSkinComfort} dark={settings.darkMode} />
             </AppleCard>
             <div className="grid grid-cols-2 gap-4">
                <TrackerMini dark={settings.darkMode} icon={<Droplets className="text-blue-400" />} label="Wasser" value={waterAmount} unit="L" onInc={() => setWaterAmount(v => v + 0.25)} onDec={() => setWaterAmount(v => Math.max(0, v - 0.25))} />
                <TrackerMini dark={settings.darkMode} icon={<Moon className="text-indigo-400" />} label="Schlaf" value={sleepAmount} unit="h" onInc={() => setSleepAmount(v => v + 0.5)} onDec={() => setSleepAmount(v => Math.max(0, v - 0.5))} />
             </div>
           </div>
        )}

        {step === 'profile' && (
          <div className="space-y-10 animate-in slide-in-from-right duration-500">
             <div className="flex flex-col items-center pt-8 text-center space-y-4">
               <div className="w-28 h-28 bg-white rounded-[44px] flex items-center justify-center shadow-xl border-4 border-white"><User className="w-12 h-12" /></div>
               <h2 className="text-3xl font-black">{settings.userName}</h2>
             </div>
             <div className="space-y-6">
                <AppleCard dark={settings.darkMode} className="!p-2">
                   <SettingsItem dark={settings.darkMode} icon={<Moon className="text-indigo-500" />} label="Dunkelmodus" value={settings.darkMode} onToggle={() => setSettings(p => ({...p, darkMode: !p.darkMode}))} isLast />
                </AppleCard>
                <SecondaryButton dark={settings.darkMode} onClick={() => setStep('welcome')}>Profil zurücksetzen</SecondaryButton>
             </div>
          </div>
        )}
      </div>

      <footer className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 bg-white/80 backdrop-blur-xl border-t flex justify-around rounded-t-[44px] shadow-2xl ${!settings.isSetupComplete ? 'opacity-20 pointer-events-none' : ''}`}>
        <NavButton dark={settings.darkMode} icon={<BarChart3 />} label="Health" active={step === 'care'} onClick={() => setStep('care')} />
        <NavButton dark={settings.darkMode} icon={<Shield />} label="Routine" active={step === 'result'} onClick={() => setStep('result')} />
        <NavButton dark={settings.darkMode} icon={<Activity />} label="Scan" active={['scan', 'daily_scan', 'product_scan'].includes(step)} onClick={() => setStep('daily_scan')} />
        <NavButton dark={settings.darkMode} icon={<User />} label="Profil" active={step === 'profile'} onClick={() => setStep('profile')} />
      </footer>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// Sub-components
const RoutineManager: React.FC<{ analysis: SkinAnalysis, dark: boolean }> = ({ analysis, dark }) => (
  <div className="space-y-8">
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-2">Morgen</h4>
      <div className="grid grid-cols-1 gap-3">
        {analysis.morningRoutine.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
      </div>
    </div>
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-2">Abend</h4>
      <div className="grid grid-cols-1 gap-3">
        {analysis.eveningRoutine.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
      </div>
    </div>
  </div>
);

const RoutineCard: React.FC<{ step: RoutineStep, dark: boolean }> = ({ step, dark }) => (
  <AppleCard dark={dark} className="!p-0 overflow-hidden shadow-sm">
    <div className="flex items-center h-24">
      <div className="w-24 h-full bg-zinc-100 flex-shrink-0">
        <img src={step.imageUrl || 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400'} className="w-full h-full object-cover" alt={step.product} />
      </div>
      <div className="p-4 flex-1 min-w-0">
        <p className="text-[8px] font-black text-zinc-500 uppercase">{step.action}</p>
        <h5 className="text-sm font-black truncate">{step.product}</h5>
        <p className="text-[10px] text-zinc-400 line-clamp-1">{step.reason}</p>
      </div>
      <ChevronRight className="w-4 h-4 mr-4 text-zinc-200" />
    </div>
  </AppleCard>
);

const QuizOption: React.FC<{ title: string, options: string[], selected: string, onSelect: (v: string) => void, dark: boolean }> = ({ title, options, selected, onSelect, dark }) => (
  <div className="space-y-8 animate-in slide-in-from-right-10">
    <h2 className="text-4xl font-black leading-tight tracking-tight">{title}</h2>
    <div className="grid grid-cols-1 gap-4">
      {options.map(opt => (
        <button key={opt} onClick={() => onSelect(opt)} className={`py-6 px-10 rounded-[36px] text-left text-xl font-black transition-all ${selected === opt ? 'bg-black text-white translate-x-3 shadow-xl' : 'bg-white border text-zinc-900'}`}>
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const MetricCard: React.FC<{ icon: React.ReactNode, label: string, value: number, color: string, dark: boolean }> = ({ icon, label, value, color, dark }) => (
  <AppleCard dark={dark} className="p-6 flex flex-col items-center gap-4">
    <div className={`p-4 rounded-3xl bg-zinc-50`}>{React.cloneElement(icon as React.ReactElement, { className: `w-7 h-7 ${color.replace('bg-', 'text-')}` })}</div>
    <div className="text-center">
      <span className="text-[9px] text-zinc-400 font-black uppercase tracking-widest block">{label}</span>
      <span className="text-3xl font-black">{value}%</span>
    </div>
  </AppleCard>
);

const TrackerMini: React.FC<{ icon: React.ReactNode, label: string, value: number, unit: string, onInc: () => void, onDec: () => void, dark: boolean }> = ({ icon, label, value, unit, onInc, onDec, dark }) => (
  <AppleCard dark={dark} className="!p-5 flex flex-col gap-4">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center">{icon}</div>
      <span className="text-[9px] font-black text-zinc-400 uppercase">{label}</span>
    </div>
    <div className="flex items-center justify-between">
      <button onClick={onDec} className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center active:scale-90"><Minus className="w-4 h-4" /></button>
      <div className="text-lg font-black">{value}<span className="text-[10px] text-zinc-400 ml-0.5">{unit}</span></div>
      <button onClick={onInc} className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center active:scale-90"><Plus className="w-4 h-4" /></button>
    </div>
  </AppleCard>
);

const SliderItem: React.FC<{ icon: React.ReactNode, label: string, value: number, max: number, min: number, onChange: (v: number) => void, dark: boolean }> = ({ icon, label, value, max, min, onChange, dark }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">{icon} <span className="text-xs font-black uppercase">{label}</span></div>
      <span className="text-lg font-black">{value}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-100 rounded-full appearance-none accent-black" />
  </div>
);

const ExpandableTip: React.FC<{ index: number, tip: string, dark: boolean }> = ({ index, tip, dark }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <AppleCard dark={dark} className="!p-0 overflow-hidden shadow-sm">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-black text-sm">{index}</div>
           <p className="text-sm font-black text-left truncate max-w-[200px]">{tip.split('.')[0]}</p>
        </div>
        <ChevronDown className={`w-5 h-5 transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2">
          <div className="p-4 rounded-2xl bg-zinc-50 text-xs leading-relaxed text-zinc-500 font-medium">{tip}</div>
        </div>
      )}
    </AppleCard>
  );
};

const SettingsItem: React.FC<{ icon: React.ReactNode, label: string, value: boolean, onToggle: () => void, isLast?: boolean, dark: boolean }> = ({ icon, label, value, onToggle, isLast, dark }) => (
  <div className={`flex items-center justify-between p-5 ${!isLast ? 'border-b border-zinc-100' : ''}`}>
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center">{icon}</div>
      <span className="text-sm font-black">{label}</span>
    </div>
    <button onClick={onToggle} className={`w-12 h-6 rounded-full relative transition-all ${value ? 'bg-black' : 'bg-zinc-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${value ? 'bg-white left-7' : 'bg-white left-1'}`}></div>
    </button>
  </div>
);

const NavButton: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void, dark: boolean }> = ({ icon, label, active, onClick, dark }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-black' : 'text-zinc-400'}`}>
    <div className={`p-2 rounded-xl ${active ? 'bg-zinc-100' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;
