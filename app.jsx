import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// A minimal error boundary so a stray render error shows a message
// instead of a blank white screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white p-8">
          <div className="max-w-lg text-center">
            <h2 className="text-xl font-bold mb-2">Something went wrong.</h2>
            <p className="text-sm opacity-80 mb-4">{String(this.state.error?.message || this.state.error)}</p>
            <button
              className="px-4 py-2 bg-red-600 rounded-lg font-bold"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [argument, setArgument] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [evaluation, setEvaluation] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [factCheckReport, setFactCheckReport] = useState(null);
  const [isFactChecking, setIsFactChecking] = useState(false);

  const [judgeVerdict, setJudgeVerdict] = useState(null);
  const [isJudging, setIsJudging] = useState(false);

  const [debateSummary, setDebateSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [tone, setTone] = useState("academic");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [stance, setStance] = useState("oppose");

  const [history, setHistory] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);

  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const wordCount = response.trim().split(/\s+/).filter(word => word.length > 0).length;

  const totalDebates = history.length;
  const averageScore = totalDebates > 0
    ? Math.round(history.reduce((acc, item) => acc + (item.eval?.score || 0), 0) / totalDebates)
    : 0;

  const getTopFallacies = () => {
    const counts = {};
    history.forEach(item => {
      if (item.eval && Array.isArray(item.eval.fallacies)) {
        item.eval.fallacies.forEach(f => {
          if (typeof f === "string" && f.toLowerCase() !== "none") counts[f] = (counts[f] || 0) + 1;
        });
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  };
  const topFallacies = getTopFallacies();

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        setArgument((prev) => prev + (prev.length > 0 ? " " : "") + transcript);
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    let timer;
    if (isTimerRunning && timeLeft > 0) timer = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    else if (timeLeft === 0) setIsTimerRunning(false);
    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeft]);

  const toggleListening = () => {
    if (!recognitionRef.current) return alert("Voice recognition not supported.");
    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
    setIsListening(!isListening);
  };

  const toggleSpeaking = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      if (!response) return;
      const utterance = new SpeechSynthesisUtterance(response);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const toggleTimer = () => {
    if (isTimerRunning) setIsTimerRunning(false);
    else {
      if (timeLeft === 0) setTimeLeft(120);
      setIsTimerRunning(true);
    }
  };
  const resetTimer = () => { setIsTimerRunning(false); setTimeLeft(0); };
  const formatTime = (s) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;

  const themeStyles = {
    wrapper: isDarkMode ? "bg-[url('/dark-bg.jpeg')] bg-black/60 bg-blend-overlay text-white" : "bg-[url('/light-bg.jpeg')] text-gray-900",
    container: isDarkMode ? "bg-black/40 border-gray-700/50" : "bg-white/30 border-white/40",
    input: isDarkMode ? "bg-black/40 border-gray-600 text-white placeholder-gray-400 focus:border-gray-400" : "bg-white/40 border-white/50 text-gray-900 placeholder-gray-600 focus:bg-white/60 focus:border-gray-400",
    buttonBase: "px-3 py-1.5 rounded transition-colors backdrop-blur-sm cursor-pointer flex items-center justify-center gap-1",
    secondaryBtn: isDarkMode ? "bg-gray-800/70 hover:bg-gray-700 text-gray-200" : "bg-white/50 hover:bg-white/70 text-gray-800 border border-white/30",
    textShadow: isDarkMode ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" : ""
  };

  const getScoreColor = (s) => s >= 80 ? "text-green-500" : s >= 50 ? "text-yellow-500" : "text-red-500";

  const getHighlightedText = (text, evalData) => {
    if (!evalData || evalData.error || (!evalData.core_claim && (!Array.isArray(evalData.unsupported_claims) || !evalData.unsupported_claims.length))) {
      return <div>{text}</div>;
    }
    let highlighted = text;
    const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    highlighted = escapeHtml(highlighted);

    if (Array.isArray(evalData.unsupported_claims)) {
      evalData.unsupported_claims.forEach(c => {
        if (c && typeof c === "string" && c.toLowerCase() !== "none") {
          highlighted = highlighted.replace(new RegExp(`(${escapeRegex(escapeHtml(c))})`, 'gi'), '<span class="bg-red-500/30 border-b-2 border-red-500 rounded px-1" title="Unsupported Claim">$1</span>');
        }
      });
    }

    if (evalData.core_claim && typeof evalData.core_claim === "string" && evalData.core_claim.toLowerCase() !== "none") {
      highlighted = highlighted.replace(new RegExp(`(${escapeRegex(escapeHtml(evalData.core_claim))})`, 'gi'), '<span class="bg-yellow-500/30 border-b-2 border-yellow-500 rounded px-1" title="Core Thesis">$1</span>');
    }
    return <div dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "application/pdf") return setUploadStatus("Error: Only PDFs.");
    setUploadStatus("Processing PDF...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      setUploadStatus(res.ok ? `✅ Loaded (${data.chunks} chunks)` : `❌ Failed: ${data.detail}`);
    } catch { setUploadStatus("❌ Error connecting."); }
    e.target.value = null;
  };

  // Safely parses a fetch Response as JSON. Returns { ok, data } instead of
  // throwing or blindly trusting the shape, so a 500 response can never
  // silently become bad state that crashes render.
  const safeJson = async (res) => {
    try {
      const data = await res.json();
      return { ok: res.ok, data };
    } catch {
      return { ok: false, data: { error: "Invalid response from server." } };
    }
  };

  const fetchDebate = async (textToDebate) => {
    if (!textToDebate.trim()) return;
    window.speechSynthesis.cancel(); setIsSpeaking(false);
    setIsStreaming(true); setIsEvaluating(true); setIsFactChecking(true);
    setResponse(""); setEvaluation(null); setJudgeVerdict(null); setFactCheckReport(null);

    const payload = { argument: textToDebate, tone, difficulty, stance };
    let latestEvaluation = null;

    fetch("http://127.0.0.1:8000/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(safeJson)
      .then(({ ok, data }) => {
        const result = ok ? data : { error: data.detail || "Evaluation failed." };
        latestEvaluation = result;
        setEvaluation(result);
      })
      .catch(() => setEvaluation({ error: "Could not reach the server." }))
      .finally(() => setIsEvaluating(false));

    fetch("http://127.0.0.1:8000/api/factcheck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(safeJson)
      .then(({ ok, data }) => setFactCheckReport(ok ? data : { error: data.detail || "Fact-check failed." }))
      .catch(() => setFactCheckReport({ error: "Could not reach the server." }))
      .finally(() => setIsFactChecking(false));

    try {
      const res = await fetch("http://127.0.0.1:8000/api/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setResponse((prev) => prev + chunk);
      }
      setHistory((prev) => [{ argument: textToDebate, response: fullText, tone, difficulty, stance, eval: latestEvaluation }, ...prev]);
    } catch { setResponse("Error fetching debate."); }
    finally { setIsStreaming(false); }
  };

  const callJudge = async () => {
    setIsJudging(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/judge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_argument: argument, ai_response: response }) });
      const { ok, data } = await safeJson(res);
      setJudgeVerdict(ok ? data : { winner: "Tie", reasoning: data.detail || "Judging failed." });
    } catch { console.error("Judging failed"); }
    finally { setIsJudging(false); }
  };

  const generateSummary = async () => {
    if (history.length === 0) return;
    setIsSummarizing(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history }) });
      const { ok, data } = await safeJson(res);
      setDebateSummary(ok ? data.summary : (data.detail || "Summary failed."));
    } catch { console.error("Summary failed"); }
    finally { setIsSummarizing(false); }
  };

  return (
    <div className={`min-h-screen p-6 font-sans bg-cover bg-center bg-fixed transition-colors duration-500 ${themeStyles.wrapper}`}>
      <header className={`mb-8 border-b pb-4 max-w-7xl mx-auto flex justify-between items-center ${isDarkMode ? 'border-gray-700/50' : 'border-gray-400/50'}`}>
        <div>
          <h1 className={`text-3xl font-bold flex items-center gap-2 ${themeStyles.textShadow}`}> Devil's Advocate</h1>
          <p className={`mt-1 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-800'} ${themeStyles.textShadow}`}>Bring an argument. Leave with a stronger one.</p>
        </div>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className={`px-4 py-2 rounded-full backdrop-blur-md shadow-lg font-bold transition-all ${isDarkMode ? 'bg-white/10 text-white border-white/20' : 'bg-white/50 text-gray-800 border-white/50'}`}>
          {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
        <div className="space-y-6">
          <div className={`p-6 rounded-xl backdrop-blur-md border shadow-xl ${themeStyles.container}`}>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {['Stance', 'Tone', 'Difficulty'].map((lbl, i) => (
                <div key={i}>
                  <label className={`block text-sm font-bold mb-1 ${themeStyles.textShadow}`}>{lbl}</label>
                  <select
                    className={`w-full border rounded-md p-2 text-sm backdrop-blur-md ${themeStyles.input}`}
                    value={lbl === 'Stance' ? stance : lbl === 'Tone' ? tone : difficulty}
                    onChange={(e) => lbl === 'Stance' ? setStance(e.target.value) : lbl === 'Tone' ? setTone(e.target.value) : setDifficulty(e.target.value)}
                  >
                    {lbl === 'Stance' && <><option value="oppose">Oppose</option><option value="support">Support</option></>}
                    {lbl === 'Tone' && <><option value="academic">Academic</option><option value="aggressive">Aggressive</option><option value="gentle">Gentle</option></>}
                    {lbl === 'Difficulty' && <><option>Beginner</option><option>Intermediate</option><option>Expert</option></>}
                  </select>
                </div>
              ))}
            </div>

            <label className={`block text-sm font-bold mb-2 ${themeStyles.textShadow}`}>Your argument</label>
            <div className="relative mb-4">
              <textarea className={`w-full h-56 border rounded-lg p-4 pb-12 resize-none backdrop-blur-md ${themeStyles.input}`} value={argument} onChange={(e) => setArgument(e.target.value)} />
              <button onClick={toggleListening} className={`absolute bottom-4 right-4 p-2 rounded-full shadow-lg ${isListening ? 'bg-red-600 animate-pulse text-white' : themeStyles.secondaryBtn}`}>{isListening ? '🛑' : '🎙️'}</button>
            </div>

            <div className="flex items-center gap-4">
              <input type="file" id="pdf" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
              <label htmlFor="pdf" className={`${themeStyles.secondaryBtn} ${themeStyles.buttonBase} shadow-md`}>📎 Upload Evidence</label>
              {uploadStatus && <span className="text-sm font-medium">{uploadStatus}</span>}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button onClick={() => fetchDebate(argument)} disabled={isStreaming || !argument.trim()} className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg flex-1 mr-4">{isStreaming ? 'Thinking...' : 'Challenge me'}</button>
            <div className="flex gap-2">
              <button onClick={toggleTimer} className={`font-mono font-bold py-3 px-6 rounded-lg border ${isTimerRunning ? 'bg-red-900/50 border-red-500 animate-pulse' : themeStyles.secondaryBtn}`}>⏱️ {formatTime(timeLeft)}</button>
              {timeLeft > 0 && !isTimerRunning && <button onClick={resetTimer} className={`${themeStyles.secondaryBtn} px-3 rounded-lg`}>↺</button>}
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center h-8">
            <span className={`text-sm font-bold ${themeStyles.textShadow}`}>{stance === 'oppose' ? 'Counterarguments' : 'Supporting'}</span>
            {response && (
              <div className="flex gap-2 text-xs">
                {!isStreaming && !judgeVerdict && stance === 'oppose' && <button onClick={callJudge} disabled={isJudging} className={`bg-amber-600 text-white ${themeStyles.buttonBase}`}>{isJudging ? '...' : '👨‍⚖️ Judge'}</button>}
                <button onClick={toggleSpeaking} className={`${themeStyles.secondaryBtn} ${themeStyles.buttonBase} ${isSpeaking ? 'text-blue-400' : ''}`}>{isSpeaking ? '🔇 Stop' : '🔊 Listen'}</button>
              </div>
            )}
          </div>

          {judgeVerdict && (
             <div className={`p-4 rounded-xl border-2 backdrop-blur-md shadow-xl ${judgeVerdict.winner === 'Human' ? 'border-green-500/50 bg-green-900/20' : judgeVerdict.winner === 'AI' ? 'border-red-500/50 bg-red-900/20' : 'border-yellow-500/50 bg-yellow-900/20'}`}>
               <div className="flex justify-between mb-2"><span className="font-bold text-sm uppercase">Verdict</span><span className="text-xl font-black">{judgeVerdict.winner}</span></div>
               <p className="text-sm">{judgeVerdict.reasoning}</p>
             </div>
          )}

          {(isFactChecking || factCheckReport) && (
            <div className={`p-4 rounded-xl border backdrop-blur-md ${themeStyles.container}`}>
              {isFactChecking ? <span className="text-sm font-medium animate-pulse">Fact-checking...</span> : (
                factCheckReport && (factCheckReport.error ? (
                  <span className="text-sm text-red-400">⚠️ {factCheckReport.error}</span>
                ) : <div>
                  <span className="text-xs font-bold uppercase mb-3 block">📄 Fact-Check Report</span>
                  <div className="space-y-3">{(factCheckReport.checks || []).map((item, idx) => (
                    <div key={idx} className="p-3 bg-black/10 rounded-lg border border-gray-500/10 text-sm">
                      <div className="flex justify-between items-center mb-1"><span className="font-semibold italic">"{item.claim}"</span><span className={`text-xs font-bold rounded ${item.status === 'Verified' ? 'text-green-400' : item.status === 'Contradicted' ? 'text-red-400' : 'text-gray-400'}`}>{item.status}</span></div>
                      <p className="text-xs opacity-80 mt-1">{item.explanation}</p>
                    </div>
                  ))}</div>
                </div>)
              )}
            </div>
          )}

          {(isEvaluating || evaluation) && (
            <div className={`p-4 rounded-xl border backdrop-blur-md shadow-xl ${themeStyles.container}`}>
              {isEvaluating ? <span className="text-sm font-medium animate-pulse">Analyzing logic...</span> : (
                evaluation && (evaluation.error ? (
                  <span className="text-sm text-red-400">⚠️ {evaluation.error}</span>
                ) : <div>
                  <div className="flex justify-between items-center mb-3"><span className="font-bold text-sm">Strength</span><span className={`text-2xl font-black ${getScoreColor(evaluation.score)}`}>{evaluation.score}/100</span></div>
                  {Array.isArray(evaluation.fallacies) && evaluation.fallacies.length > 0 && evaluation.fallacies[0]?.toLowerCase() !== "none" && (
                    <div className="mt-2 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                      <span className="text-xs font-bold text-red-400 uppercase block mb-1">⚠️ Fallacies</span>
                      <ul className="list-disc pl-4 text-sm text-red-200">{evaluation.fallacies.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-500/30">
                    <span className="text-xs font-bold uppercase block mb-2 opacity-70">Breakdown (Yellow = Thesis, Red = Unsupported)</span>
                    <div className="text-sm leading-relaxed italic border-l-4 border-gray-500/50 pl-3">{getHighlightedText(argument, evaluation)}</div>
                  </div>
                </div>)
              )}
            </div>
          )}

          <div className={`flex-1 min-h-88 border rounded-lg p-6 whitespace-pre-wrap leading-relaxed shadow-xl backdrop-blur-md overflow-auto ${themeStyles.container}`}>
            {response || <span className="italic font-medium opacity-80">Awaiting premise...</span>}
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className={`mt-16 border-t pt-8 max-w-7xl mx-auto ${isDarkMode ? 'border-gray-700/50' : 'border-gray-400/50'}`}>
          <div className={`mb-12 p-8 rounded-xl border backdrop-blur-md shadow-2xl ${themeStyles.container}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${themeStyles.textShadow}`}>📊 Analytics</h3>
              <button onClick={generateSummary} disabled={isSummarizing} className={`${themeStyles.secondaryBtn} ${themeStyles.buttonBase}`}>
                {isSummarizing ? "Summarizing..." : "📝 Generate Debate Summary"}
              </button>
            </div>

            {debateSummary && (
              <div className="mb-6 p-6 rounded-lg bg-blue-900/20 border border-blue-500/30 text-sm leading-relaxed whitespace-pre-wrap">
                <span className="font-bold text-blue-400 uppercase tracking-wider block mb-2">Memory Summary</span>
                {debateSummary}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-black/10 rounded-lg border border-gray-500/20">
                <p className="text-sm font-medium uppercase opacity-70">Total Debates</p>
                <p className="text-5xl font-black mt-2">{totalDebates}</p>
              </div>
              <div className="text-center p-4 bg-black/10 rounded-lg border border-gray-500/20">
                <p className="text-sm font-medium uppercase opacity-70">Avg Score</p>
                <p className={`text-5xl font-black mt-2 ${getScoreColor(averageScore)}`}>{averageScore}</p>
              </div>
              <div className="text-center p-4 bg-black/10 rounded-lg border border-gray-500/20">
                <p className="text-sm font-medium uppercase mb-2 opacity-70">Top Fallacies</p>
                {topFallacies.length > 0 ? (
                  <ul className="text-sm text-left inline-block space-y-1">
                    {topFallacies.map(([f, c], i) => <li key={i} className="text-red-400">⚠️ {f} ({c})</li>)}
                  </ul>
                ) : <p className="text-lg font-bold mt-2 text-green-500">Perfect Logic!</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
