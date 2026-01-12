
import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle2, ChevronRight, ChevronDown, Activity, Droplets, Sparkles, Shield, User, Plus, Minus, Package, Loader2, AlertTriangle, Trash, HardDrive, Bell, Moon, Zap, Smile, Trophy, Flame, Scan, Heart, Wand2, Info, Download, Upload, BarChart3, Clock } from 'lucide-react';
import { AppStep, QuizData, SkinAnalysis, ScanStep, RoutineStep, UserSettings, WeatherData, ScannedProduct } from './types';
import { AppleCard, PrimaryButton, SecondaryButton } from './components/AppleCard';
import { analyzeSkin, getRealtimeWeather, analyzeProduct } from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('welcome');
  const [loadingMsg, setLoadingMsg] = useState('Initialisiere...');
  const [loadingStatus, setLoadingStatus] = useState('Warte auf System...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [images, setImages] = useState<{ [key: string]: string }>({});
  const [scanIndex, setScanIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isBloping, setIsBloping] = useState(false);
  
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
    darkMode: false, notifications: true, userName: 'Skin AI User', skinTypeGoal: 'Radiant Skin', 
    isSetupComplete: false, points: 0, streak: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [settings.darkMode]);

  useEffect(() => {
    const saved = localStorage.getItem('glowai_v2_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.settings) setSettings(parsed.settings);
        if (parsed.analysis) setAnalysis(parsed.analysis);
        if (parsed.settings?.isSetupComplete) setStep('care');
      } catch (e) { console.error("Restore failed", e); }
    }
  }, []);

  useEffect(() => {
    if (settings.isSetupComplete) {
      const leanAnalysis = analysis ? {
        ...analysis,
        morningRoutine: analysis.morningRoutine?.map(s => ({ ...s, imageUrl: undefined })) || [],
        eveningRoutine: analysis.eveningRoutine?.map(s => ({ ...s, imageUrl: undefined })) || [],
      } : null;
      localStorage.setItem('glowai_v2_data', JSON.stringify({ settings, analysis: leanAnalysis }));
    }
  }, [settings, analysis]);

  const scanSteps: ScanStep[] = [
    { label: 'Frontal', instruction: 'Halte dein Gesicht mittig.', id: 'front' },
    { label: 'Links', instruction: 'Drehe dein Gesicht nach links.', id: 'left' },
    { label: 'Rechts', instruction: 'Drehe dein Gesicht nach rechts.', id: 'right' }
  ];

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const data = await getRealtimeWeather(pos.coords.latitude, pos.coords.longitude);
          setWeather(data);
        } catch (e) {}
      });
    }
  }, []);

  useEffect(() => {
    if (['scan', 'daily_scan', 'product_scan'].includes(step)) {
      startCamera();
      const detectionTimer = setTimeout(() => {
        setIsFaceDetected(true);
        setIsScanning(true);
      }, 3000);

      return () => {
        clearTimeout(detectionTimer);
        stopCamera();
        setIsFaceDetected(false);
        setIsScanning(false);
      };
    }
  }, [step]);

  useEffect(() => {
    if (isScanning && isFaceDetected && (step === 'scan' || step === 'daily_scan')) startProgress();
    else stopProgress();
  }, [isScanning, isFaceDetected, scanIndex]);

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
    }, 80); 
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setErrorMsg("Kamerazugriff verweigert. Bitte Berechtigungen prüfen.");
      setStep('analyzing');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
        
        setIsBloping(true);
        setTimeout(() => setIsBloping(false), 400);

        if (step === 'daily_scan') {
           setStep('analyzing');
           setLoadingMsg("Tagesprofil...");
           setTimeout(() => setStep('care'), 1200);
           return;
        }

        if (step === 'product_scan') {
          setLoadingMsg("Inhaltsstoffe...");
          setStep('analyzing');
          try {
            const res = await analyzeProduct(dataUrl, quiz);
            setScannedProduct(res);
            setStep('product_result');
          } catch (e: any) {
            setErrorMsg(e.message === "API_KEY_MISSING" ? "API Key fehlt." : "Analyse fehlgeschlagen.");
          }
          return;
        }

        const currentId = scanSteps[scanIndex].id;
        setImages(prev => ({ ...prev, [currentId]: dataUrl }));

        if (scanIndex < scanSteps.length - 1) {
          setIsFaceDetected(false);
          setIsScanning(false);
          setScanIndex(prev => prev + 1);
          setScanProgress(0);
          setTimeout(() => {
            setIsFaceDetected(true);
            setIsScanning(true);
          }, 2000);
        } else {
          setIsScanning(false);
          setStep('quiz');
          stopCamera();
        }
      }
    }
  };

  const handleQuizSubmit = async () => {
    setErrorMsg(null);
    setStep('analyzing');
    setLoadingMsg("KI Analyse");
    setLoadingStatus("Scanne Porengröße...");

    const ticker = [
      "Erkenne Hautstruktur...",
      "Analysiere UV-Schäden...",
      "Prüfe Hydrations-Level...",
      "Berechne Anti-Aging Score...",
      "Finalisiere Routine..."
    ];
    let i = 0;
    const interval = setInterval(() => {
      if(i < ticker.length) setLoadingStatus(ticker[i++]);
      else clearInterval(interval);
    }, 2000);

    try {
      const result = await analyzeSkin(images, quiz, weather || undefined);
      if (!result || !result.morningRoutine) throw new Error("Ungültige Antwort der KI.");
      setAnalysis(result);
      setSettings(prev => ({...prev, isSetupComplete: true, points: prev.points + 250, streak: prev.streak + 1}));
      clearInterval(interval);
      setStep('result');
    } catch (err: any) {
      clearInterval(interval);
      setErrorMsg(err.message === "API_KEY_MISSING" ? "API Key erforderlich." : "Analyse-Fehler. Die KI konnte die Bilder nicht verarbeiten. Bitte erneut versuchen.");
    }
  };

  const exportData = () => {
    const data = localStorage.getItem('glowai_v2_data');
    if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GlowAI_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.settings) {
          localStorage.setItem('glowai_v2_data', content);
          window.location.reload();
        } else {
          alert("Ungültiges Format.");
        }
      } catch (err) {
        alert("Fehler beim Lesen der Datei.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={`min-h-screen max-w-md mx-auto px-6 py-10 flex flex-col transition-all duration-500 ${settings.darkMode ? 'bg-black text-white' : 'bg-transparent text-zinc-900'}`}>
      <header className="mb-8 flex items-center justify-between z-10 fade-in-up">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'} rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-500`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">GlowAI</h1>
        </div>
        {settings.isSetupComplete && (
           <button onClick={() => setStep('profile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${settings.darkMode ? 'bg-zinc-800' : 'bg-white shadow-sm border border-zinc-100'}`}>
             <User className="w-5 h-5" />
           </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-32 no-scrollbar">
        {step === 'welcome' && (
          <div className="space-y-10">
            <div className="relative pt-4">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-pink-200/30 rounded-full blur-3xl"></div>
              <div className="absolute top-40 -right-10 w-40 h-40 bg-blue-200/30 rounded-full blur-3xl"></div>
              
              <div className="relative rounded-[56px] overflow-hidden aspect-[4/5] shadow-2xl border-[6px] border-white animate-float z-10 transition-all duration-500">
                <img src="https://images.unsplash.com/photo-1552046122-03184de85e08?auto=format&fit=crop&q=80&w=800" className="w-full h-full object-cover" alt="Skin Care Aesthetic" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-10">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 apple-blur rounded-full text-[10px] font-bold text-white uppercase tracking-wider mb-2 border border-white/20">
                      <Wand2 className="w-3 h-3" /> Kritische KI Analyse
                    </div>
                    <h2 className="text-5xl font-black text-white leading-[0.9] tracking-tighter">
                      Hautpflege.<br/>Präzise.
                    </h2>
                    <p className="text-white/70 text-sm font-medium leading-relaxed max-w-[240px]">
                      Entdecke was deine Haut wirklich braucht – ungeschönt und wissenschaftlich.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 fade-in-up" style={{ animationDelay: '0.2s' }}>
               <FeatureTeaser icon={<Scan className="w-4 h-4" />} label="Analyse" dark={settings.darkMode} />
               <FeatureTeaser icon={<Heart className="w-4 h-4" />} label="Ehrlichkeit" dark={settings.darkMode} />
               <FeatureTeaser icon={<Shield className="w-4 h-4" />} label="Wissenschaft" dark={settings.darkMode} />
            </div>

            <div className="space-y-4 fade-in-up" style={{ animationDelay: '0.4s' }}>
              <PrimaryButton 
                dark={settings.darkMode} 
                onClick={() => setStep('scan')}
                className="shine-effect !rounded-[24px] !py-6 animate-pulse-glow"
              >
                Scan & Diagnose starten
              </PrimaryButton>
              <p className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Dermatologisch fundiert • 30 Sek.
              </p>
            </div>
          </div>
        )}

        {step === 'scan_hub' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="space-y-2">
              <h2 className="text-4xl font-black">Scan</h2>
              <p className="text-zinc-500 text-sm font-medium">Wähle deine Analyse-Methode</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => setStep('daily_scan')}
                className={`w-full p-8 rounded-[48px] text-left border flex items-center gap-6 active:scale-[0.98] transition-all duration-300 ${settings.darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}
              >
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
                  <Camera className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-black text-lg">Haut-Entwicklung</h3>
                  <p className="text-xs text-zinc-500 font-medium">Dokumentiere deinen täglichen Glow</p>
                </div>
              </button>

              <button 
                onClick={() => setStep('product_scan')}
                className={`w-full p-8 rounded-[48px] text-left border flex items-center gap-6 active:scale-[0.98] transition-all duration-300 ${settings.darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100 shadow-sm'}`}
              >
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${settings.darkMode ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                  <Package className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-black text-lg">Inhaltsstoff-Check</h3>
                  <p className="text-xs text-zinc-500 font-medium">KI-Analyse deiner Pflegeprodukte</p>
                </div>
              </button>
            </div>

            <AppleCard dark={settings.darkMode} className="!bg-zinc-50 dark:!bg-zinc-900/50 border-dashed">
              <p className="text-[10px] font-black uppercase tracking-widest text-center text-zinc-400">Tipp: Scanne bei Tageslicht für beste Ergebnisse</p>
            </AppleCard>
          </div>
        )}

        {(['scan', 'daily_scan', 'product_scan'].includes(step)) && step !== 'scan_hub' && (
          <div className="space-y-8 animate-in fade-in duration-500 text-center">
            <div className="space-y-1">
              <h2 className="text-3xl font-black">
                {step === 'daily_scan' ? 'Quick Scan' : step === 'product_scan' ? 'Produkt-Check' : scanSteps[scanIndex].label}
              </h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-300">
                {!isFaceDetected ? 'Suche Gesicht...' : 'Haut erkannt - Nicht bewegen'}
              </p>
            </div>
            <div className={`relative aspect-square w-full max-w-[300px] mx-auto transition-transform ${isBloping ? 'blop-anim' : ''}`}>
              <svg className="absolute inset-[-16px] w-[calc(100%+32px)] h-[calc(100%+32px)] rotate-[-90deg]">
                <circle cx="50%" cy="50%" r="48%" className="stroke-zinc-100/20 fill-none" strokeWidth="3" />
                <circle cx="50%" cy="50%" r="48%" className={`stroke-black dark:stroke-white fill-none transition-all duration-100 ${isFaceDetected ? 'opacity-100' : 'opacity-20'}`} strokeWidth="5" strokeDasharray="100 100" strokeDashoffset={100 - scanProgress} strokeLinecap="round" pathLength="100" />
              </svg>
              <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl border-4 border-white z-10 bg-zinc-50">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className={`face-guide ${isFaceDetected ? 'detected' : ''}`}></div>
                <div className={`absolute top-0 left-0 w-full h-1 bg-white/40 scan-anim z-20 ${isScanning ? 'block' : 'hidden'}`}></div>
              </div>
            </div>
            {step === 'product_scan' && (
              <PrimaryButton dark={settings.darkMode} onClick={captureImage} className="w-auto px-12 rounded-full">Foto aufnehmen</PrimaryButton>
            )}
            {!isFaceDetected && step === 'scan' && (
              <p className="text-xs text-zinc-400 font-medium animate-pulse">Positioniere dein Gesicht im Rahmen...</p>
            )}
          </div>
        )}

        {step === 'quiz' && (
          <div className="space-y-8 animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-4">
              <div className="h-1 flex-1 bg-zinc-200/30 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${settings.darkMode ? 'bg-white' : 'bg-black'}`} style={{ width: `${((quizStep + 1) / 7) * 100}%` }}></div>
              </div>
              <span className="text-[10px] font-black text-zinc-400">{quizStep + 1}/7</span>
            </div>
            {quizStep === 0 && <QuizOption title="Wie alt bist du?" options={['18-24', '25-34', '35-44', '45+']} selected={quiz.age} onSelect={v => { setQuiz({...quiz, age: v}); setQuizStep(1); }} dark={settings.darkMode} />}
            {quizStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-4xl font-black tracking-tight">Hautziele?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {['Unreinheiten', 'Anti-Aging', 'Glow', 'Poren', 'Trockenheit', 'Rötungen'].map(goal => (
                    <button key={goal} onClick={() => setQuiz(p => ({...p, concerns: p.concerns.includes(goal) ? p.concerns.filter(c => c !== goal) : [...p.concerns, goal]}))} className={`py-5 rounded-3xl text-[10px] font-black uppercase transition-all ${quiz.concerns.includes(goal) ? (settings.darkMode ? 'bg-white text-black scale-105' : 'bg-black text-white scale-105') : (settings.darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-white border text-zinc-400')}`}>
                      {goal}
                    </button>
                  ))}
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={() => setQuizStep(2)} disabled={quiz.concerns.length === 0}>Weiter</PrimaryButton>
              </div>
            )}
            {quizStep >= 2 && quizStep <= 5 && (
              <QuizOption 
                title={["Empfindlichkeit?", "Sonnenschutz?", "Wasserzufuhr?", "Schlaf?"][quizStep-2]} 
                options={[['Robust', 'Normal', 'Sensibel', 'Sehr'], ['Nie', 'Selten', 'Oft', 'Immer'], ['Wenig', 'Mittel', 'Viel', 'Sehr viel'], ['<5h', '6h', '7h', '8h+']][quizStep-2]}
                selected={[quiz.sensitivity, quiz.sunExposure, quiz.waterIntake, quiz.sleepHours][quizStep-2]}
                onSelect={v => {
                  const keys = ['sensitivity', 'sunExposure', 'waterIntake', 'sleepHours'];
                  setQuiz({...quiz, [keys[quizStep-2]]: v});
                  setQuizStep(quizStep + 1);
                }}
                dark={settings.darkMode}
              />
            )}
            {quizStep === 6 && (
              <div className="space-y-6">
                <h2 className="text-4xl font-black tracking-tight">Lebensstil?</h2>
                {['Stressarm', 'Normal', 'Viel Stress', 'Extrem'].map(l => (
                  <button key={l} onClick={() => setQuiz({...quiz, lifestyle: l})} className={`w-full py-6 px-8 rounded-3xl text-left font-black border transition-all ${quiz.lifestyle === l ? (settings.darkMode ? 'bg-white text-black translate-x-2' : 'bg-black text-white translate-x-2') : (settings.darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white')}`}>
                    {l}
                  </button>
                ))}
                <PrimaryButton dark={settings.darkMode} onClick={handleQuizSubmit} disabled={!quiz.lifestyle}>Analyse finalisieren</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in">
            {!errorMsg ? (
              <>
                <div className={`w-24 h-24 rounded-3xl shadow-xl flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${settings.darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
                  <Loader2 className={`w-10 h-10 animate-spin ${settings.darkMode ? 'text-zinc-700' : 'text-zinc-200'}`} />
                  <div className={`absolute bottom-0 left-0 w-full h-1 animate-pulse ${settings.darkMode ? 'bg-white' : 'bg-black'}`}></div>
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-black">{loadingMsg}</h2>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse">{loadingStatus}</p>
                </div>
              </>
            ) : (
              <div className={`text-center space-y-6 p-10 rounded-[40px] shadow-xl border ${settings.darkMode ? 'bg-zinc-900 border-red-900/30' : 'bg-white border-red-50'}`}>
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-black text-xl text-red-600">Ein Fehler ist aufgetreten</h3>
                  <p className="text-zinc-500 text-sm font-medium">{errorMsg}</p>
                </div>
                <PrimaryButton dark={settings.darkMode} onClick={() => setStep('welcome')}>Zurück zum Start</PrimaryButton>
              </div>
            )}
          </div>
        )}

        {step === 'result' && analysis && (
          <div className="space-y-10 animate-in fade-in duration-700">
             <div className="text-center pt-6">
               <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Diagnose Score</span>
               <div className="text-9xl font-black tracking-tighter transition-all duration-700">{analysis.overallScore}</div>
               <div className={`${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'} px-8 py-2 rounded-full font-black text-[10px] uppercase inline-block mt-4`}>{analysis.skinType}</div>
             </div>
             
             <AppleCard dark={settings.darkMode} className="!bg-black text-white border-none">
                <h4 className="font-black text-xs uppercase tracking-widest mb-3 opacity-60">Ehrliches Fazit</h4>
                <p className="text-sm font-medium leading-relaxed italic opacity-90">"{analysis.summary}"</p>
             </AppleCard>

             <RoutineManager dark={settings.darkMode} analysis={analysis} />
             <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Mein Dashboard</PrimaryButton>
          </div>
        )}

        {step === 'care' && (
           <div className="space-y-10 animate-in fade-in pb-12">
             <div className="flex justify-between items-end">
               <div className="space-y-1">
                 <h2 className="text-4xl font-black tracking-tight">Health</h2>
                 <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">Dashboard • Heute</p>
               </div>
               <div className="flex gap-2">
                 <div className={`${settings.darkMode ? 'bg-yellow-400/5 text-yellow-500 border-white/5' : 'bg-yellow-400/10 text-yellow-600 border-zinc-100'} px-3 py-2 rounded-2xl border flex items-center gap-1.5 shadow-sm`}>
                   <Trophy className="w-4 h-4" />
                   <span className="text-xs font-black">{settings.points}</span>
                 </div>
                 <div className="bg-orange-500 text-white px-3 py-2 rounded-2xl flex items-center gap-1.5 shadow-md border border-orange-400">
                   <Flame className="w-4 h-4" />
                   <span className="text-xs font-black">{settings.streak}d</span>
                 </div>
               </div>
             </div>
             
             <div className="grid grid-cols-1 gap-6">
                <AppleCard dark={settings.darkMode} className="!p-8 space-y-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${settings.darkMode ? 'bg-white/5 text-white' : 'bg-black text-white'}`}>
                        <BarChart3 className="w-6 h-6" />
                      </div>
                      <h3 className="font-black text-lg">Vital-Tracking</h3>
                    </div>
                  </div>

                  <div className="space-y-10">
                    <SliderItem icon={<Zap className="text-yellow-500" />} label="Stressbelastung" value={stressLevel} max={10} min={1} onChange={setStressLevel} dark={settings.darkMode} />
                    <SliderItem icon={<Smile className="text-emerald-500" />} label="Hautgefühl" value={skinComfort} max={10} min={1} onChange={setSkinComfort} dark={settings.darkMode} />
                  </div>
                </AppleCard>

                <div className="grid grid-cols-2 gap-4">
                  <TrackerMini dark={settings.darkMode} icon={<Droplets className="text-sky-500" />} label="Hydration" value={waterAmount} unit="L" onInc={() => setWaterAmount(v => +(v + 0.2).toFixed(1))} onDec={() => setWaterAmount(v => Math.max(0, +(v - 0.2).toFixed(1)))} />
                  <TrackerMini dark={settings.darkMode} icon={<Clock className="text-indigo-500" />} label="Ruhephase" value={sleepAmount} unit="h" onInc={() => setSleepAmount(v => v + 0.5)} onDec={() => setSleepAmount(v => Math.max(0, v - 0.5))} />
                </div>

                {analysis && (
                  <AppleCard dark={settings.darkMode} className="!bg-emerald-500/5 !border-emerald-500/20">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-lg shadow-emerald-200 shadow-lg">{analysis.overallScore}</div>
                      <div>
                        <h4 className="font-black text-sm">Haut-Zustand</h4>
                        <p className="text-[10px] font-bold text-emerald-600 uppercase">Gute Stabilität • Dranbleiben</p>
                      </div>
                    </div>
                  </AppleCard>
                )}
             </div>
           </div>
        )}

        {step === 'product_result' && scannedProduct && (
          <div className="space-y-8 animate-in slide-in-from-bottom-10">
            <div className={`relative aspect-square w-full rounded-[48px] overflow-hidden shadow-xl border-4 ${settings.darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-white bg-white'}`}>
              <img src={scannedProduct.imageUrl} className="w-full h-full object-cover" alt="Product" />
              <div className={`absolute top-6 right-6 px-5 py-2.5 rounded-3xl flex items-center gap-2 ${settings.darkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
                <span className="text-2xl font-black">{scannedProduct.rating}</span>
                <span className="text-[10px] opacity-60">/10</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black">{scannedProduct.name}</h2>
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase inline-block ${scannedProduct.suitability === 'Sehr gut' ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                {scannedProduct.suitability}
              </div>
            </div>
            <AppleCard dark={settings.darkMode}>
              <p className="text-sm font-medium leading-relaxed">{scannedProduct.personalReason}</p>
            </AppleCard>
            <PrimaryButton dark={settings.darkMode} onClick={() => setStep('care')}>Fertig</PrimaryButton>
          </div>
        )}

        {step === 'profile' && (
          <div className="space-y-10 animate-in slide-in-from-right duration-400">
             <div className="flex flex-col items-center pt-6 space-y-4">
               <div className={`w-24 h-24 rounded-[40px] shadow-lg flex items-center justify-center border-4 overflow-hidden ${settings.darkMode ? 'bg-zinc-800 border-zinc-800' : 'bg-white border-white'}`}>
                 <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${settings.userName}`} className="w-full h-full" alt="User" />
               </div>
               <h2 className="text-3xl font-black">{settings.userName}</h2>
             </div>
             
             <div className="space-y-6">
                <AppleCard dark={settings.darkMode} className="!p-0 overflow-hidden">
                    <SettingsItem dark={settings.darkMode} icon={<Bell className="text-blue-400" />} label="Benachrichtigungen" value={settings.notifications} onToggle={() => setSettings(p => ({...p, notifications: !p.notifications}))} />
                    <SettingsItem dark={settings.darkMode} icon={<Moon className="text-indigo-400" />} label="Dunkelmodus" value={settings.darkMode} onToggle={() => setSettings(p => ({...p, darkMode: !p.darkMode}))} isLast />
                </AppleCard>

                <AppleCard dark={settings.darkMode} className="space-y-4">
                  <h4 className="font-black text-[10px] uppercase tracking-widest text-zinc-400">Daten Management</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={exportData} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all active:scale-95 ${settings.darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-100'}`}>
                      <Download className="w-5 h-5 text-blue-500" />
                      <span className="text-[10px] font-black uppercase">Export</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all active:scale-95 ${settings.darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-100'}`}>
                      <Upload className="w-5 h-5 text-emerald-500" />
                      <span className="text-[10px] font-black uppercase">Import</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept=".json" onChange={importData} className="hidden" />
                  </div>
                </AppleCard>
             </div>

             <SecondaryButton dark={settings.darkMode} onClick={() => { if(confirm("Möchtest du wirklich alle Daten löschen?")) { localStorage.removeItem('glowai_v2_data'); window.location.reload(); } }} className="!text-red-500">Konto zurücksetzen</SecondaryButton>
          </div>
        )}
      </div>

      <footer className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 transition-all duration-500 ${!settings.isSetupComplete ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100'}`}>
        <div className={`apple-blur border flex justify-around p-2 rounded-[32px] shadow-2xl transition-all duration-500 ${settings.darkMode ? 'bg-zinc-900/90 border-zinc-800 shadow-black' : 'bg-white/90 border-zinc-100 shadow-zinc-200'}`}>
          <NavButton icon={<Activity />} label="Health" active={step === 'care'} onClick={() => setStep('care')} dark={settings.darkMode} />
          <NavButton icon={<Shield />} label="Pflege" active={['result'].includes(step)} onClick={() => setStep('result')} dark={settings.darkMode} />
          <NavButton icon={<Camera />} label="Scan" active={['scan', 'daily_scan', 'product_scan', 'scan_hub'].includes(step)} onClick={() => setStep('scan_hub')} dark={settings.darkMode} />
          <NavButton icon={<User />} label="Profil" active={step === 'profile'} onClick={() => setStep('profile')} dark={settings.darkMode} />
        </div>
      </footer>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const FeatureTeaser: React.FC<{ icon: React.ReactNode, label: string, dark: boolean }> = ({ icon, label, dark }) => (
  <div className={`flex flex-col items-center gap-2 p-4 rounded-3xl border apple-blur shadow-sm transition-colors duration-500 ${dark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white/40 border-white/60'}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dark ? 'bg-white text-black' : 'bg-black text-white'}`}>
      {icon}
    </div>
    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</span>
  </div>
);

const RoutineManager: React.FC<{ analysis: SkinAnalysis, dark: boolean }> = ({ analysis, dark }) => (
  <div className="space-y-8">
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-4">Morgen-Routine</h4>
      {analysis.morningRoutine?.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
    </div>
    <div className="space-y-4">
      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-4">Abend-Routine</h4>
      {analysis.eveningRoutine?.map((s, i) => <RoutineCard key={i} step={s} dark={dark} />)}
    </div>
  </div>
);

const RoutineCard: React.FC<{ step: RoutineStep, dark: boolean }> = ({ step, dark }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      onClick={() => setIsExpanded(!isExpanded)}
      className={`flex flex-col rounded-[32px] overflow-hidden shadow-sm border cursor-pointer active:scale-[0.98] transition-all duration-300 ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}
    >
      <div className="flex items-center">
        <div className={`w-20 h-20 flex-shrink-0 transition-all ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
          <img src={step.imageUrl || 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400'} className="w-full h-full object-cover" alt="Product" />
        </div>
        <div className="p-4 flex-1 min-w-0">
          <h5 className="text-sm font-black truncate">{step.product}</h5>
          <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{step.action}</p>
        </div>
        <div className="mr-6 transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-300" /> : <ChevronRight className="w-4 h-4 text-zinc-300" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className={`px-6 pb-6 pt-2 animate-in slide-in-from-top-2 duration-300`}>
           <div className={`h-px w-full mb-4 ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}></div>
           <div className="flex gap-3">
             <div className="mt-1"><Info className="w-4 h-4 text-zinc-400" /></div>
             <p className={`text-xs font-medium leading-relaxed ${dark ? 'text-zinc-400' : 'text-zinc-600'}`}>
               {step.reason || "Dieses Produkt wurde speziell basierend auf deiner Hautanalyse ausgewählt, um optimale Ergebnisse zu erzielen."}
             </p>
           </div>
        </div>
      )}
    </div>
  );
};

const QuizOption: React.FC<{ title: string, options: string[], selected: string, onSelect: (v: string) => void, dark: boolean }> = ({ title, options, selected, onSelect, dark }) => (
  <div className="space-y-6">
    <h2 className="text-4xl font-black tracking-tight">{title}</h2>
    <div className="grid grid-cols-1 gap-3">
      {options.map(opt => (
        <button key={opt} onClick={() => onSelect(opt)} className={`py-6 px-8 rounded-3xl text-left font-black border transition-all ${selected === opt ? (dark ? 'bg-white text-black translate-x-2' : 'bg-black text-white translate-x-2') : (dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white hover:border-zinc-300')}`}>
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const TrackerMini: React.FC<{ icon: React.ReactNode, label: string, value: number, unit: string, onInc: () => void, onDec: () => void, dark: boolean }> = ({ icon, label, value, unit, onInc, onDec, dark }) => (
  <div className={`p-6 border rounded-[36px] shadow-sm flex flex-col gap-4 transition-all duration-500 ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
    </div>
    <div className="flex items-center justify-between">
      <button onClick={onDec} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-75 ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`}><Minus className="w-4 h-4 text-zinc-400" /></button>
      <div className="text-xl font-black">{value}<span className="text-[10px] text-zinc-400 ml-1">{unit}</span></div>
      <button onClick={onInc} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-75 ${dark ? 'bg-white text-black' : 'bg-black text-white'}`}><Plus className="w-4 h-4" /></button>
    </div>
  </div>
);

const SliderItem: React.FC<{ icon: React.ReactNode, label: string, value: number, max: number, min: number, onChange: (v: number) => void, dark: boolean }> = ({ icon, label, value, max, min, onChange, dark }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
        <span className="text-[10px] font-black uppercase">{label}</span>
      </div>
      <span className="text-xl font-black">{value}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className={`w-full h-1 rounded-full appearance-none accent-black dark:accent-white ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
  </div>
);

const SettingsItem: React.FC<{ icon: React.ReactNode, label: string, value: boolean, onToggle: () => void, isLast?: boolean, dark: boolean }> = ({ icon, label, value, onToggle, isLast, dark }) => (
  <div className={`flex items-center justify-between p-6 ${!isLast ? (dark ? 'border-b border-zinc-800' : 'border-b border-zinc-50') : ''}`}>
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${dark ? 'bg-zinc-800' : 'bg-zinc-50'} flex items-center justify-center`}>{icon}</div>
      <span className="font-bold">{label}</span>
    </div>
    <button onClick={onToggle} className={`w-12 h-7 rounded-full relative transition-all duration-300 ${value ? (dark ? 'bg-white' : 'bg-black') : (dark ? 'bg-zinc-800' : 'bg-zinc-200')}`}>
      <div className={`absolute top-1 w-5 h-5 rounded-full transition-all ${value ? 'left-6' : 'left-1'} ${value && dark ? 'bg-black' : 'bg-white'}`}></div>
    </button>
  </div>
);

// Fixed TS error by typing icon as React.ReactElement and providing a generic to cloneElement
const NavButton: React.FC<{ icon: React.ReactElement, label: string, active: boolean, onClick: () => void, dark: boolean }> = ({ icon, label, active, onClick, dark }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all flex-1 ${active ? (dark ? 'text-white' : 'text-black') : 'text-zinc-400'}`}>
    <div className={`p-2 rounded-xl transition-colors duration-300 ${active ? (dark ? 'bg-white/10' : 'bg-black/5') : ''}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
    </div>
    <span className={`text-[8px] font-black uppercase tracking-tighter ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
  </button>
);

export default App;
