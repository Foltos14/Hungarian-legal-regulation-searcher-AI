/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Search, Scale, Calendar, FileText, Info, Loader2, AlertCircle, ChevronRight, Clock, Settings, Check, X, ListFilter, MessageSquare, ShieldCheck, ArrowLeft, Send, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LegalResult {
  hataly: string;
  nev: string;
  url: string;
  helymegjeloles: string;
  tema: string;
  csoport: string;
  ervenyesseg: string;
  magyarazat: string;
  idezet: string;
  buntetes: string;
}

interface HistoryItem {
  id: string;
  situation: string;
  results: LegalResult[];
  timestamp: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const COLUMN_LABELS: Record<string, string> = {
  hataly: "Hatály",
  nev: "Jogszabály neve",
  helymegjeloles: "Helymegjelölés",
  tema: "Téma/Fejezet",
  ervenyesseg: "Érvényesség",
  magyarazat: "Magyarázat",
  idezet: "Szószerinti idézet",
  buntetes: "Büntetési tétel",
};

type View = 'home' | 'search' | 'lawyer';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LegalResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    hataly: true,
    nev: true,
    helymegjeloles: true,
    tema: true,
    ervenyesseg: true,
    magyarazat: true,
    idezet: true,
    buntetes: true,
  });

  // AI Lawyer State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('legal_search_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('legal_search_history', JSON.stringify(history));
  }, [history]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" }), []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!situation.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: `Keresd meg az njt.hu oldalon az ÖSSZES releváns magyar jogszabályt a következő helyzetre: "${situation}". 
        
        KRITIKUS UTASÍTÁS: 
        1. Ne állj meg a legfontosabb találatoknál! Keress meg MINDEN olyan törvényt, kormányrendeletet, helyi rendeletet vagy egyéb jogszabályt, ami akár csak érintőlegesen is kapcsolódhat a témához.
        2. Ha több tucat találat van, sorold fel mindet. Addig keress, amíg van releváns információ.
        3. TÖBB TÉMA KEZELÉSE: Ha a keresési kifejezés több különálló témát érint (pl. "zaklatás és pedofilok"), válaszd szét őket. 
           - A "csoport" mezőbe írd be, hogy melyik témához tartozik az adott találat (pl. "Zaklatás", "Pedofília"). 
           - Ha egy jogszabály mindkét témát érinti, vagy közös súlyosbító tényezőket tartalmaz a két témára vonatkozóan, a "csoport" mező legyen "Közös / Súlyosbító tényezők".
           - Ha csak egy téma van, a "csoport" legyen "Eredmények".
        4. REKURZÍV KERESÉS: Ha egy megtalált paragrafus vagy büntetési tétel hivatkozik egy MÁSIK jogszabályra vagy paragrafusra, azt is vedd fel a listába külön sorként a következő elemként.
        5. Minden találathoz keress konkrét paragrafusokat, bekezdéseket és pontokat. A "helymegjeloles" mezőben pontosan jelöld meg ezeket, az "idezet" mezőbe pedig írd be a SZÓSZERINTI idézetet pontosan abból a paragrafusból/bekezdésből/pontból, amit megjelöltél.
        6. A "url" mezőbe írd be a közvetlen linket az adott jogszabályhoz az njt.hu oldalon.
        7. A "tema" mezőbe írd be az adott jogszabályi rész fejezetének vagy alcímének nevét (pl. "A lopás", "Közös költség", "Záró rendelkezések").
        8. Az "ervenyesseg" mezőbe írd le röviden, hogy milyen konkrét esetekre, személyekre vagy szituációkra érvényes az adott paragrafus (pl. "Csak magánszemélyekre", "Vészhelyzet esetén", "18 év felettiekre").
        9. A büntetési tételnél részletesen térj ki a minősített esetekre, enyhítő/súlyosító körülményekre és a 18 év alattiakra vonatkozó speciális szabályokra is.
        
        Válaszolj egy JSON tömbbel, amely objektumokat tartalmaz a megadott sémának megfelelően.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hataly: { type: Type.STRING },
                nev: { type: Type.STRING },
                url: { type: Type.STRING, description: "Közvetlen link az njt.hu oldalon a jogszabályhoz" },
                helymegjeloles: { type: Type.STRING },
                tema: { type: Type.STRING, description: "Az adott paragrafus témája, fejezete vagy címe" },
                csoport: { type: Type.STRING, description: "Melyik témához tartozik a találat (pl. 'Zaklatás', 'Pedofília', 'Közös / Súlyosbító tényezők')" },
                ervenyesseg: { type: Type.STRING, description: "Milyen esetekre érvényes a szabály" },
                magyarazat: { type: Type.STRING },
                idezet: { type: Type.STRING },
                buntetes: { type: Type.STRING }
              },
              required: ["hataly", "nev", "url", "helymegjeloles", "tema", "csoport", "ervenyesseg", "magyarazat", "idezet", "buntetes"]
            }
          }
        }
      });

      let fullText = "";
      for await (const chunk of response) {
        fullText += chunk.text;
        
        // Improved partial JSON parsing
        try {
          const cleaned = fullText.trim();
          if (cleaned.startsWith('[')) {
            let jsonToParse = cleaned;
            
            // If it doesn't end with ']', try to make it a valid array by finding the last complete object
            if (!cleaned.endsWith(']')) {
              const lastBrace = cleaned.lastIndexOf('}');
              if (lastBrace !== -1) {
                jsonToParse = cleaned.substring(0, lastBrace + 1) + ']';
              } else {
                continue; // Not even one object complete yet
              }
            }
            
            const parsed = JSON.parse(jsonToParse);
            if (Array.isArray(parsed)) {
              setResults(parsed);
            }
          }
        } catch (e) {
          // Ignore partial parse errors
        }
      }

      // Final parse to ensure everything is caught
      if (fullText) {
        try {
          const finalResults: LegalResult[] = JSON.parse(fullText);
          setResults(finalResults);
          
          // Add to history
          const newHistoryItem: HistoryItem = {
            id: Date.now().toString(),
            situation: situation,
            results: finalResults,
            timestamp: Date.now(),
          };
          setHistory(prev => [newHistoryItem, ...prev.slice(0, 19)]);
        } catch (e) {
          console.error("Final parse error:", e);
        }
      }
    } catch (err) {
      console.error("Keresési hiba:", err);
      setError("Hiba történt a keresés során. Kérjük, próbálja újra később.");
    } finally {
      setLoading(false);
    }
  };

  const handleLawyerChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: "Te egy profi magyar AI Ügyvéd vagy. Kizárólag valós magyar jogszabályok alapján adj tanácsot és indoklást. Ne használj feltételezéseket, mindig hivatkozz a pontos törvényi helyekre az njt.hu adatai alapján. Ha nem vagy biztos egy jogszabályban, használd a keresőt. A válaszaid legyenek szakmaiak, de érthetőek.",
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text;
      if (text) {
        setChatMessages(prev => [...prev, { role: 'model', text: text }]);
      }
    } catch (err) {
      console.error("Chat hiba:", err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sajnálom, hiba történt a konzultáció során. Kérlek, próbáld újra." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setView('search');
    setSituation(item.situation);
    setResults(item.results);
    setShowHistory(false);
    setError(null);
  };

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [col]: !prev[col]
    }));
  };

  const groupedResults = useMemo(() => {
    const groups: Record<string, LegalResult[]> = {};
    results.forEach(result => {
      const groupName = result.csoport || 'Eredmények';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(result);
    });
    return groups;
  }, [results]);

  const ExpandableText = ({ text }: { text: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isClamped, setIsClamped] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);

    // Megnövelt alapértelmezett limit (8 sor) a jobb olvashatóság érdekében széles képernyőn
    const CLAMP_CLASS = "line-clamp-8";

    useEffect(() => {
      const checkClamped = () => {
        if (textRef.current) {
          const { scrollHeight, clientHeight } = textRef.current;
          
          if (!isExpanded) {
            // Csak akkor rövidítünk, ha a szöveg jelentősen hosszabb (legalább 1.5 sorral), mint a limit.
            // Ez teljesíti a kérést: ha "majdnem" kifér, akkor ne rövidítsük le.
            const isSignificantlyTaller = scrollHeight > clientHeight + 35; 
            setIsClamped(isSignificantlyTaller);
          }
        }
      };

      const timeout = setTimeout(checkClamped, 50);
      window.addEventListener('resize', checkClamped);
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('resize', checkClamped);
      };
    }, [text, isExpanded]);

    return (
      <div className="flex flex-col gap-1 h-full">
        <div 
          ref={textRef}
          className={cn(
            "transition-all duration-300", 
            (!isExpanded && isClamped) && CLAMP_CLASS
          )}
        >
          {text}
        </div>
        {(isClamped || isExpanded) && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-800 text-xs font-bold w-fit mt-1 flex items-center gap-1 shrink-0"
          >
            {isExpanded ? (
              <>Kevesebb <X className="w-3 h-3" /></>
            ) : (
              <>Több mutatása... <ChevronRight className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => setView('home')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Magyar Jogszabály Kereső</h1>
          </button>
          
          <div className="flex items-center gap-4">
            {view !== 'home' && (
              <button 
                onClick={() => setView('home')}
                className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Vissza a főoldalra
              </button>
            )}
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-2 rounded-full transition-colors relative",
                showHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-500"
              )}
              title="Keresési előzmények"
            >
              <Clock className="w-6 h-6" />
              {history.length > 0 && !showHistory && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full" />
              )}
            </button>
          </div>
        </div>

        {/* History Dropdown */}
        {showHistory && (
          <div className="absolute top-16 right-4 w-80 max-h-[80vh] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h4 className="font-bold text-sm uppercase tracking-wider text-gray-500">Keresési előzmények</h4>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-200 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              {history.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Még nincsenek előzmények
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="w-full p-4 text-left hover:bg-blue-50 transition-colors group"
                    >
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1 group-hover:text-blue-700">
                        {item.situation}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                        <span>{new Date(item.timestamp).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{item.results.length} találat</span>
                      </div>
                    </button>
                  ))}
                  <button 
                    onClick={() => { setHistory([]); localStorage.removeItem('legal_search_history'); }}
                    className="w-full p-3 text-center text-xs text-red-500 font-bold hover:bg-red-50 transition-colors"
                  >
                    Előzmények törlése
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className={cn(
        "flex-grow mx-auto px-4 py-8 w-full transition-all duration-500",
        view === 'search' && results.length > 0 ? "max-w-[98vw]" : "max-w-7xl"
      )}>
        {view === 'home' && (
          <div className="max-w-4xl mx-auto py-12">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold mb-4 tracking-tight">Üdvözöljük a Jogszabály Keresőben</h2>
              <p className="text-xl text-gray-600">Válasszon az alábbi szolgáltatások közül</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Search Option */}
              <button 
                onClick={() => setView('search')}
                className="group p-8 bg-white border-2 border-gray-100 rounded-3xl shadow-sm hover:border-blue-500 hover:shadow-xl hover:shadow-blue-100 transition-all text-left flex flex-col h-full"
              >
                <div className="bg-blue-50 p-4 rounded-2xl w-fit mb-6 group-hover:bg-blue-600 transition-colors">
                  <Search className="w-8 h-8 text-blue-600 group-hover:text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-3">Jogszabály kereső</h3>
                <p className="text-gray-600 mb-6 flex-grow">
                  Keressen konkrét jogszabályokat, paragrafusokat és büntetési tételeket az njt.hu adatbázisában egy adott élethelyzet alapján.
                </p>
                <div className="flex items-center text-blue-600 font-bold gap-2">
                  Megnyitás <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* AI Lawyer Option */}
              <button 
                onClick={() => setView('lawyer')}
                className="group p-8 bg-white border-2 border-gray-100 rounded-3xl shadow-sm hover:border-blue-500 hover:shadow-xl hover:shadow-blue-100 transition-all text-left flex flex-col h-full"
              >
                <div className="bg-blue-50 p-4 rounded-2xl w-fit mb-6 group-hover:bg-blue-600 transition-colors">
                  <ShieldCheck className="w-8 h-8 text-blue-600 group-hover:text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-3">AI Ügyvéd</h3>
                <p className="text-gray-600 mb-6 flex-grow">
                  Konzultáljon mesterséges intelligenciával, amely kizárólag valós magyar jogszabályok alapján ad tanácsot és indoklást.
                </p>
                <div className="flex items-center text-blue-600 font-bold gap-2">
                  Konzultáció indítása <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        )}

        {view === 'search' && (
          <div className="animate-in fade-in duration-500">
            {/* Search Section */}
            <section className="mb-12">
              <div className="max-w-3xl mx-auto text-center mb-8">
                <h2 className="text-3xl font-bold mb-4">Milyen élethelyzetre keresel jogszabályt?</h2>
                <p className="text-gray-600">Írd le a szituációt és kikeresem a jogszabályokat.</p>
              </div>

              <form onSubmit={handleSearch} className="max-w-4xl mx-auto relative group">
                <div className="relative">
                  <textarea
                    value={situation}
                    onChange={(e) => setSituation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSearch(e as any);
                      }
                    }}
                    placeholder="Például: Milyen szabályok vonatkoznak a társasházi közös költség emelésére?"
                    className="w-full min-h-[120px] p-6 pr-16 bg-white border-2 border-gray-200 rounded-2xl shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all outline-none text-lg resize-none"
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !situation.trim()}
                    className="absolute bottom-4 right-4 p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-200"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
                  </button>
                </div>
              </form>
            </section>

            {/* Results Section */}
            {error && (
              <div className="max-w-4xl mx-auto mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {loading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  <Scale className="w-6 h-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-lg">Jogszabályok keresése folyamatban...</p>
                  <p className="text-sm text-gray-500">Ez igénybe vehet néhány másodpercet az njt.hu adatbázisában.</p>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-12 w-full max-w-[98vw] mx-auto">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      Összes talált jogszabály ({results.length})
                    </h3>
                    {loading && (
                      <div className="flex items-center gap-2 text-blue-600 text-sm font-medium animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Továbbiak keresése...
                      </div>
                    )}
                  </div>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setShowColumnMenu(!showColumnMenu)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <ListFilter className="w-4 h-4 text-gray-500" />
                      Oszlopok beállítása
                    </button>

                    {showColumnMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowColumnMenu(false)} />
                        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-40 p-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1">
                            Megjelenített oszlopok
                          </div>
                          {Object.keys(COLUMN_LABELS).map((col) => (
                            <button
                              key={col}
                              onClick={() => toggleColumn(col)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                            >
                              <span className={cn(visibleColumns[col] ? "text-gray-900" : "text-gray-400")}>
                                {COLUMN_LABELS[col]}
                              </span>
                              {visibleColumns[col] && <Check className="w-4 h-4 text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {Object.entries(groupedResults).map(([groupName, groupItems]) => (
                  <div key={groupName} className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-3 px-2">
                      <div className="h-8 w-1 bg-blue-600 rounded-full" />
                      <h4 className="text-xl font-bold text-gray-800">{groupName}</h4>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">
                        {groupItems.length} találat
                      </span>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              {visibleColumns.hataly && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Hatály</th>}
                              {visibleColumns.nev && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Jogszabály neve</th>}
                              {visibleColumns.helymegjeloles && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Helymegjelölés</th>}
                              {visibleColumns.tema && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Téma/Fejezet</th>}
                              {visibleColumns.ervenyesseg && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-44">Érvényesség</th>}
                              {visibleColumns.magyarazat && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-60">Magyarázat</th>}
                              {visibleColumns.buntetes && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Büntetési tétel</th>}
                              {visibleColumns.idezet && <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[400px]">Szószerinti idézet</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {groupItems.map((result, idx) => (
                              <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                {visibleColumns.hataly && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                                      <span className="font-medium">{result.hataly}</span>
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.nev && (
                                  <td className="px-6 py-5 align-top">
                                    <a 
                                      href={result.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="font-bold text-sm text-gray-900 leading-tight hover:text-blue-600 transition-colors flex items-center gap-1 group/link"
                                    >
                                      {result.nev}
                                      <ChevronRight className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                    </a>
                                  </td>
                                )}
                                {visibleColumns.helymegjeloles && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                      {result.helymegjeloles}
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.tema && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="text-sm font-semibold text-gray-700 leading-tight">
                                      {result.tema}
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.ervenyesseg && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="text-sm text-gray-600 leading-relaxed">
                                      <ExpandableText text={result.ervenyesseg} />
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.magyarazat && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="text-sm text-gray-600 leading-relaxed italic">
                                      <ExpandableText text={result.magyarazat} />
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.buntetes && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="inline-flex items-center px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold border border-red-100">
                                      {result.buntetes}
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.idezet && (
                                  <td className="px-6 py-5 align-top">
                                    <div className="relative">
                                      <div className="absolute -left-3 top-0 bottom-0 w-1 bg-blue-100 rounded-full group-hover:bg-blue-300 transition-colors" />
                                      <div className="text-sm text-gray-800 leading-relaxed font-serif pl-2">
                                        <ExpandableText text={result.idezet} />
                                      </div>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && results.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="bg-gray-100 p-6 rounded-full mb-4">
                  <Search className="w-12 h-12" />
                </div>
                <p className="text-lg font-medium">Még nincs megjeleníthető eredmény</p>
                <p className="text-sm">Írd le a helyzetet és kattintson a keresésre.</p>
              </div>
            )}
          </div>
        )}

        {view === 'lawyer' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-200px)] flex flex-col animate-in fade-in duration-500">
            <div className="bg-white border border-gray-200 rounded-t-3xl p-6 flex items-center gap-4 shadow-sm">
              <div className="bg-blue-600 p-3 rounded-2xl">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">AI Ügyvéd Konzultáció</h3>
                <p className="text-sm text-gray-500">Valós jogszabályok alapján, indoklással.</p>
              </div>
            </div>

            <div className="flex-grow bg-white border-x border-gray-200 overflow-y-auto p-6 space-y-6">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-4">
                  <MessageSquare className="w-12 h-12 opacity-20" />
                  <p className="max-w-xs">Üdvözlöm! Milyen jogi kérdésben kérne tanácsot? Kérem, írja le a helyzetet részletesen.</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex gap-4 max-w-[85%]",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    msg.role === 'user' ? "bg-gray-200" : "bg-blue-600"
                  )}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-gray-600" /> : <Bot className="w-4 h-4 text-white" />}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'user' ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-100 text-gray-800 rounded-tl-none"
                  )}>
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-800 prose-pre:text-white">
                      <ReactMarkdown>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-4 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-gray-100 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-sm text-gray-500">Az ügyvéd gondolkodik...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleLawyerChat} className="bg-white border border-gray-200 rounded-b-3xl p-4 flex gap-2 shadow-lg">
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleLawyerChat(e as any);
                  }
                }}
                placeholder="Írja le kérdését..."
                className="flex-grow px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
                disabled={chatLoading}
              />
              <button 
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-200 mt-12 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-5 h-5 text-blue-600" />
              <span className="font-bold">Magyar Jogszabály Kereső</span>
            </div>
            <p className="text-sm text-gray-500 max-w-md">
              Ez az alkalmazás mesterséges intelligencia segítségével keres az njt.hu nyilvános adatbázisában. 
              Az adatok tájékoztató jellegűek, nem minősülnek jogi tanácsadásnak.
            </p>
          </div>
          <div className="flex flex-col md:items-end gap-1">
            <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
              <a href="https://njt.hu" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">Nemzeti Jogszabálytár</a>
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              <span className="text-black">© doki 2026</span>
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
              All Rights Reserved
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              Powered by Gemini AI & Google Search
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}


