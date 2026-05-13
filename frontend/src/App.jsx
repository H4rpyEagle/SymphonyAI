import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const API = import.meta.env.VITE_API_URL || "/api";
const CHAVE_TEMA = "symphony-theme";

async function readFetchError(res) {
  const status = `HTTP ${res.status}`;
  const raw = await res.text().catch(() => "");
  if (!raw) return status;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.erro === "string" && j.erro.trim()) return `${status}: ${j.erro.trim()}`;
  } catch {
    /* ignore */
  }
  const snippet = raw.slice(0, 200).replace(/\s+/g, " ").trim();
  return snippet ? `${status}: ${snippet}` : status;
}



const QUADRANT_IDS = new Set(["Q1", "Q2", "Q3", "Q4"]);

/** Evita re-render quando o poll devolve os mesmos dados */
function normCreatedAt(iso) {
  if (iso == null || iso === "") return "";
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? String(iso) : String(ms);
}

function stableTarefaFingerprint(t) {
  if (!t) return "";
  return [
    t.id,
    t.titulo,
    t.descricao ?? "",
    t.quadrante ?? "",
    t.status ?? "",
    t.e_pareto,
    t.e_dois_minutos,
    t.horario_sugerido ?? "",
    normCreatedAt(t.criado_em),
  ].join("\x1e");
}

function tarefasDataEqual(a, b) {
  if (a === b) return true;
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la === 0 && lb === 0) return true;
  if (la !== lb || !a || !b) return false;
  const byId = new Map(b.map((t) => [t.id, t]));
  for (const ta of a) {
    const tb = byId.get(ta.id);
    if (!tb || stableTarefaFingerprint(ta) !== stableTarefaFingerprint(tb)) return false;
  }
  return true;
}

function obterTemaSalvo() {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    if (v === "dark" || v === "light") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

const COLUMNS = [
  {
    id: "Q1",
    titulo: "Q1 — Urgente & Importante",
    subtitulo: "Fazer já",
    accent:
      "border-accent-q1/45 bg-accent-q1/[0.07] dark:border-accent-q1/60 dark:bg-accent-q1/5",
    dot: "bg-accent-q1",
  },
  {
    id: "Q2",
    titulo: "Q2 — Planeamento",
    subtitulo: "Importante, não urgente",
    accent:
      "border-accent-q2/40 bg-accent-q2/[0.06] dark:border-accent-q2/50 dark:bg-accent-q2/5",
    dot: "bg-accent-q2",
  },
  {
    id: "Q3",
    titulo: "Q3 — Delegar",
    subtitulo: "Urgente, pouco impacto",
    accent:
      "border-accent-q3/40 bg-accent-q3/[0.06] dark:border-accent-q3/50 dark:bg-accent-q3/5",
    dot: "bg-accent-q3",
  },
  {
    id: "Q4",
    titulo: "Q4 — Eliminar",
    subtitulo: "Minimizar ou remover",
    accent:
      "border-slate-300/90 bg-slate-200/70 dark:border-accent-q4/40 dark:bg-slate-800/40",
    dot: "bg-accent-q4",
  },
];

function formatarData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Agente visual ligado à fila (não ao poll da API):
 * - trabalhando: há tarefas por classificar
 * - dormindo: fila vazia — dormindo com olhos fechados
 */
function AgenteClassificacao({ variant }) {
  const trabalhando = variant === "trabalhando";
  const dormindo = variant === "dormindo";
  return (
    <div
      className={`relative flex h-[7.25rem] w-[7.25rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 transition-[border-color,box-shadow,background-color] duration-500 ${
        trabalhando
          ? "animate-robot-work border-sky-400/90 bg-gradient-to-br from-sky-200/95 via-sky-50 to-white text-sky-800 shadow-[0_0_26px_-4px_rgba(56,189,248,0.5)] dark:from-sky-900/75 dark:via-ink-900 dark:to-ink-950 dark:border-sky-400/55 dark:text-sky-200 dark:shadow-[0_0_22px_-6px_rgba(56,189,248,0.35)]"
          : "motion-safe:animate-robot-sleep border-indigo-200/70 bg-gradient-to-br from-indigo-100/90 via-slate-100 to-slate-50 text-indigo-900/85 shadow-inner shadow-indigo-200/40 dark:border-indigo-900/50 dark:from-ink-900 dark:via-ink-950 dark:to-ink-950 dark:text-indigo-200/90 dark:shadow-black/40"
      }`}
      role="img"
      aria-label={
        trabalhando
          ? "Agente de IA trabalhando na fila de classificação"
          : "Agente de IA a dormir — fila de classificação vazia"
      }
    >
      {dormindo ? (
        <>
          <span
            className="pointer-events-none absolute right-1 top-1 font-serif text-lg font-bold leading-none text-indigo-400/90 motion-safe:animate-zzz-a dark:text-indigo-300/80"
            aria-hidden
          >
            z
          </span>
          <span
            className="pointer-events-none absolute right-5 top-4 font-serif text-sm font-bold leading-none text-indigo-300/75 motion-safe:animate-zzz-b dark:text-indigo-400/60"
            aria-hidden
          >
            z
          </span>
        </>
      ) : null}
      <svg
        className="relative z-[1] h-[4.85rem] w-[4.85rem]"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <g
          style={
            trabalhando
              ? { transformOrigin: "40px 14px" }
              : { transformOrigin: "40px 14px", transform: "translateY(3px) rotate(-10deg)" }
          }
          className={trabalhando ? "motion-safe:animate-antenna-wiggle transition-transform duration-500" : "transition-transform duration-500"}
        >
          <path
            d="M40 8v12M32 10h16"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="40" cy="6" r="3.2" fill="currentColor" />
        </g>
        <rect
          x="15"
          y="24"
          width="50"
          height="44"
          rx="13"
          stroke="currentColor"
          strokeWidth="2.3"
          fill="currentColor"
          fillOpacity={trabalhando ? 0.1 : 0.08}
        />
        {/* rosto: trabalho — olhos abertos */}
        <g className="transition-opacity duration-500" style={{ opacity: trabalhando ? 1 : 0 }}>
          <circle cx="30" cy="41" r="5.5" fill="currentColor" fillOpacity="0.92" />
          <circle cx="50" cy="41" r="5.5" fill="currentColor" fillOpacity="0.92" />
          <path
            d="M28 56c4 6 20 6 24 0"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="30" cy="66" r="2" fill="currentColor" fillOpacity="0.85" className="animate-pulse" />
          <circle
            cx="40"
            cy="66"
            r="2"
            fill="currentColor"
            fillOpacity="0.85"
            className="animate-pulse"
            style={{ animationDelay: "0.12s" }}
          />
          <circle
            cx="50"
            cy="66"
            r="2"
            fill="currentColor"
            fillOpacity="0.85"
            className="animate-pulse"
            style={{ animationDelay: "0.24s" }}
          />
        </g>
        {/* rosto: sono — olhos fechados (arcos) */}
        <g className="transition-opacity duration-500" style={{ opacity: dormindo ? 1 : 0 }}>
          <path
            d="M23 42 Q30 46 37 42"
            stroke="currentColor"
            strokeWidth="2.3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M43 42 Q50 46 57 42"
            stroke="currentColor"
            strokeWidth="2.3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M32 56 Q40 60 48 56"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <rect x="8" y="34" width="9" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="63" y="34" width="9" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      {trabalhando ? (
        <div
          className="pointer-events-none absolute inset-[14%] z-0 overflow-hidden rounded-[0.95rem] rounded-b-[1.05rem] opacity-95"
          aria-hidden
        >
          <div className="animate-agent-scan absolute left-[7%] right-[7%] h-[3px] rounded-full bg-gradient-to-r from-transparent via-sky-400 to-transparent dark:via-sky-300" />
        </div>
      ) : null}
    </div>
  );
}

const MIME_ARRASTAR = "application/x-symphony-tarefa";

function payloadArrastar(tarefaId, source) {
  return JSON.stringify({ tarefaId, source });
}

const TarefaCard = memo(function TarefaCard({ tarefa, onConcluir, onRestaurar }) {
  const isConcluido = tarefa.status === "concluido";
  return (
    <article
      draggable={!isConcluido}
      onDragStart={(e) => {
        if (isConcluido) return;
        e.dataTransfer.setData(MIME_ARRASTAR, payloadArrastar(tarefa.id, "coluna"));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-lg border bg-white p-2 shadow-sm backdrop-blur-sm transition ${
        isConcluido
          ? "border-slate-200/50 opacity-60 dark:border-slate-700/50 dark:bg-ink-800/50"
          : "cursor-grab border-slate-200 hover:border-slate-300 active:cursor-grabbing dark:border-slate-700/80 dark:bg-ink-800/90 dark:shadow-black/20 dark:hover:border-slate-600"
      }`}
      role="article"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-xs font-semibold leading-tight ${isConcluido ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>
          {tarefa.titulo}
        </h3>
        {!isConcluido ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConcluir && onConcluir(tarefa.id); }}
            className="shrink-0 rounded text-slate-400 transition-colors hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400"
            title="Concluir tarefa"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRestaurar && onRestaurar(tarefa.id); }}
            className="shrink-0 rounded text-slate-400 transition-colors hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400"
            title="Restaurar tarefa"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        )}
      </div>
      {tarefa.descricao ? (
        <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">
          {tarefa.descricao}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {tarefa.e_pareto ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">
            80/20
          </span>
        ) : null}
        {tarefa.e_dois_minutos ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            ≤ 2min
          </span>
        ) : null}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
          {tarefa.horario_sugerido}
        </span>
      </div>

    </article>
  );
},
(prev, next) => stableTarefaFingerprint(prev.tarefa) === stableTarefaFingerprint(next.tarefa));

const InboxDragCard = memo(function InboxDragCard({ tarefa, onConcluir, className = "" }) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_ARRASTAR, payloadArrastar(tarefa.id, "caixa_entrada"));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`min-w-0 flex-1 cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing dark:border-slate-600 dark:bg-ink-800/95 dark:shadow-black/20 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-xs font-semibold text-slate-900 dark:text-white">
          {tarefa.titulo}
        </h3>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onConcluir(tarefa.id); }}
          className="shrink-0 rounded text-slate-400 transition-colors hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400"
          title="Concluir tarefa"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
      {tarefa.descricao ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          {tarefa.descricao}
        </p>
      ) : null}
    </article>
  );
},
(prev, next) =>
  prev.className === next.className &&
  stableTarefaFingerprint(prev.tarefa) === stableTarefaFingerprint(next.tarefa));

export default function App() {
  const [tema, setTema] = useState(() => obterTemaSalvo());
  const [tarefas, setTarefas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  /** tarefas da API sem quadrante — quadrante escolhido ao arrastar (sincronização com servidor pode vir depois) */
  const [quadranteManual, setManualQuadrant] = useState({});
  const [alvoDrop, setDropTarget] = useState(null);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const teveFetchSucesso = useRef(false);

  const [historicoAgente, setHistoricoAgente] = useState([]);
  const [mostrarHistoricoAgente, setMostrarHistoricoAgente] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const carregarHistoricoAgente = useCallback(async () => {
    setCarregandoHistorico(true);
    try {
      const res = await fetch(`${API}/historico`);
      if (!res.ok) throw new Error(await readFetchError(res));
      const data = await res.json();
      setHistoricoAgente(data.historico || []);
    } catch (e) {
      console.error(e);
      setErro(e.message || "Falha ao carregar histórico");
    } finally {
      setCarregandoHistorico(false);
    }
  }, []);

  useEffect(() => {
    if (mostrarHistoricoAgente) {
      carregarHistoricoAgente();
    }
  }, [mostrarHistoricoAgente, carregarHistoricoAgente]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      tema === "dark" ? "dark" : "light"
    );
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      /* ignore */
    }
  }, [tema]);

  useEffect(() => {
    const clear = () => setDropTarget(null);
    document.addEventListener("dragend", clear);
    return () => document.removeEventListener("dragend", clear);
  }, []);

  const carregarTarefas = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tarefas`);
      if (!res.ok) throw new Error(await readFetchError(res));
      const data = await res.json();
      const next = data.tarefas || [];
      const apply = () => {
        setTarefas((prev) => (tarefasDataEqual(prev, next) ? prev : next));
        setErro((e) => (e ? null : e));
      };
      if (!teveFetchSucesso.current) {
        apply();
        teveFetchSucesso.current = true;
      } else {
        startTransition(apply);
      }
    } catch (e) {
      setErro(e.message || "Falha ao carregar tarefas");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarTarefas();
    const t = setInterval(carregarTarefas, 2000);
    return () => clearInterval(t);
  }, [carregarTarefas]);



  const apiNaoClassificadas = useMemo(
    () => tarefas.filter((t) => t.status !== "concluido" && (!t.quadrante || !QUADRANT_IDS.has(t.quadrante))),
    [tarefas]
  );

  const caixa_entradaList = useMemo(() => {
    return apiNaoClassificadas.filter((t) => !quadranteManual[t.id]);
  }, [apiNaoClassificadas, quadranteManual]);

  const agentVariant = caixa_entradaList.length > 0 ? "trabalhando" : "dormindo";

  const porQuadrante = (q) => {
    return tarefas.filter((t) => {
      if (t.status === "concluido") return false;
      const eff = quadranteManual[t.id] ?? t.quadrante;
      return eff === q;
    });
  };

  const tarefasConcluidas = useMemo(
    () => tarefas.filter((t) => t.status === "concluido"),
    [tarefas]
  );

  const lidarComConclusao = async (tarefaId) => {
    setTarefas((prev) => prev.map((t) => (t.id === tarefaId ? { ...t, status: "concluido" } : t)));
    try {
      const res = await fetch(`${API}/tarefas/${tarefaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "concluido" }),
      });
      if (!res.ok) throw new Error(await readFetchError(res));
    } catch (e) {
      console.error(e);
      setErro("Falha ao concluir tarefa.");
      carregarTarefas(); // Rollback
    }
  };

  const lidarComRestaurar = async (tarefaId) => {
    setTarefas((prev) => prev.map((t) => (t.id === tarefaId ? { ...t, status: "a_fazer" } : t)));
    try {
      const res = await fetch(`${API}/tarefas/${tarefaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "a_fazer" }),
      });
      if (!res.ok) throw new Error(await readFetchError(res));
    } catch (e) {
      console.error(e);
      setErro("Falha ao restaurar tarefa.");
      carregarTarefas(); // Rollback
    }
  };

  const lidarComDropNoQuadrante = async (e, quadrantId) => {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(MIME_ARRASTAR);
    if (!raw) return;
    try {
      const { tarefaId, source } = JSON.parse(raw);
      if (!tarefaId || (source !== "caixa_entrada" && source !== "coluna")) return;
      
      // Update state optimistically
      setManualQuadrant((prev) => ({ ...prev, [tarefaId]: quadrantId }));
      
      // Update backend
      const res = await fetch(`${API}/tarefas/${tarefaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quadrante: quadrantId }),
      });
      if (!res.ok) throw new Error(await readFetchError(res));
      carregarTarefas(); // Refresh
    } catch (e) {
      console.error(e);
      setErro("Falha ao mover tarefa para o quadrante.");
      carregarTarefas(); // Rollback
    }
  };

  const lidarComDropNaCaixaDeEntrada = async (e) => {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(MIME_ARRASTAR);
    if (!raw) return;
    try {
      const { tarefaId, source } = JSON.parse(raw);
      if (!tarefaId || source !== "coluna") return;
      
      // Optimistic update
      setManualQuadrant((prev) => {
        const next = { ...prev };
        delete next[tarefaId];
        return next;
      });

      // Update backend to pending
      const res = await fetch(`${API}/tarefas/${tarefaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quadrante: "pendente" }),
      });
      if (!res.ok) throw new Error(await readFetchError(res));
      carregarTarefas(); // Refresh
    } catch (e) {
      console.error(e);
      setErro("Falha ao mover tarefa para a fila.");
      carregarTarefas(); // Rollback
    }
  };

  const temaBtn =
    "rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-900";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
      <header className="border-b border-slate-200/90 bg-white/70 backdrop-blur-md dark:border-slate-800/80 dark:bg-ink-900/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400/90">
              Symphony AI
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
              Matriz de Eisenhower
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Dashboard Kanban por urgência e importância (quadrantes Q1–Q4). As tarefas
              chegam via webhook (n8n / WhatsApp) e podem ser classificadas com IA.
            </p>
          </div>
          <div
            className="flex rounded-lg border border-slate-300 bg-slate-100/90 p-0.5 self-start sm:self-auto dark:border-slate-600 dark:bg-slate-800/80"
            role="group"
            aria-label="Tema da interface"
          >
            <button
              type="button"
              onClick={() => setTema("light")}
              aria-pressed={tema === "light"}
              className={`${temaBtn} ${
                tema === "light"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Claro
            </button>
            <button
              type="button"
              onClick={() => setTema("dark")}
              aria-pressed={tema === "dark"}
              className={`${temaBtn} ${
                tema === "dark"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Escuro
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {erro ? (
          <div
            className="mb-6 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            <strong className="font-semibold">Erro: </strong>
            {erro}
            <span className="mt-1 block text-xs text-rose-800 dark:text-rose-300/80">
              Confirme o backend (porta 3001) e o proxy Vite. Erros de base:{" "}
              <code className="rounded bg-rose-100/80 px-0.5 dark:bg-ink-900">backend/.env</code> com{" "}
              <code className="rounded bg-rose-100/80 px-0.5 dark:bg-ink-900">DATABASE_URL</code>,{" "}
              <code className="rounded bg-rose-100/80 px-0.5 dark:bg-ink-900">schema.sql</code> no SQL Editor. Se vir{" "}
              <code className="rounded bg-rose-100/80 px-0.5 dark:bg-ink-900">ENOTFOUND db.*.supabase.co</code>, use a
              URI do <strong>Session pooler</strong> no Supabase (Connect) — o host direct é muitas vezes só IPv6. Teste{" "}
              <code className="rounded bg-rose-100/80 px-0.5 dark:bg-ink-900">/api/health?db=1</code>.
            </span>
          </div>
        ) : null}

        {carregando && tarefas.length === 0 ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-500">
            A carregar tarefas…
          </p>
        ) : null}

        <section
          className={`mb-8 overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-md shadow-slate-200/40 dark:border-slate-700/80 dark:bg-ink-900/50 dark:shadow-black/30 ${
            alvoDrop === "caixa_entrada"
              ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950"
              : ""
          }`}
          aria-label="Fila de classificação"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget("caixa_entrada");
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
          }}
          onDrop={lidarComDropNaCaixaDeEntrada}
        >
          <div className="flex flex-col gap-4 border-b border-slate-200/90 bg-slate-50/90 px-4 py-4 dark:border-slate-700/80 dark:bg-ink-950/40 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-start gap-4 sm:items-center">
              <AgenteClassificacao variant={agentVariant} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                    Fila de classificação
                  </h2>
                  <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950/80 dark:text-sky-300">
                    IA automática
                  </span>
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center gap-2"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span
                    className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight transition-colors duration-500 ${
                      agentVariant === "trabalhando"
                        ? "border-sky-300/90 bg-sky-100 text-sky-900 dark:border-sky-600/80 dark:bg-sky-950/80 dark:text-sky-100"
                        : "border-indigo-200/90 bg-indigo-50/90 text-indigo-950 dark:border-indigo-800/70 dark:bg-ink-800 dark:text-indigo-100"
                    }`}
                  >
                    {agentVariant === "trabalhando" ? (
                      <>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-60 motion-reduce:animate-none" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500 motion-reduce:opacity-100" />
                        </span>
                        Trabalhando — há tarefas na fila
                      </>
                    ) : (
                      <>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-indigo-400/90 shadow-[0_0_0_2px_rgba(129,140,248,0.25)] dark:bg-indigo-300/80"
                          aria-hidden
                        />
                        Dormindo... — fila vazia
                      </>
                    )}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Com entradas por classificar, o agente acorda e processa; quando a fila fica
                  vazia, volta a dormir.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Estado da fila
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-slate-800 dark:border-slate-600 dark:bg-ink-800 dark:text-slate-100">
                {caixa_entradaList.length} {caixa_entradaList.length === 1 ? "entrada" : "entradas"}
              </span>
            </div>
          </div>

          <div className="px-4 py-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-500">
              Ordem de processamento
            </h3>

            {caixa_entradaList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center dark:border-slate-700 dark:bg-ink-950/30">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Fila vazia
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  Novas tarefas sem quadrante aparecem aqui, por ordem.
                </p>
              </div>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {caixa_entradaList.map((tarefa, index) => (
                  <li
                    key={tarefa.id}
                    className="flex items-stretch gap-3 rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm dark:border-slate-700/80 dark:bg-ink-800/60 dark:shadow-black/20"
                  >
                    <div className="flex w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-center dark:bg-ink-900/90">
                      <span className="text-[9px] font-medium uppercase text-slate-400 dark:text-slate-500">
                        #
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <InboxDragCard
                      tarefa={tarefa}
                      onConcluir={lidarComConclusao}
                      className="border-0 bg-transparent shadow-none dark:border-0 dark:bg-transparent dark:shadow-none"
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200/90 bg-white/60 p-4 shadow-sm dark:border-slate-700/60 dark:bg-ink-900/40" aria-label="Legenda das etiquetas">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Legenda das Etiquetas</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">Alta relevância (80/20)</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">Regra de Pareto: tarefas com maior impacto.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Fazer agora</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">Atividades rápidas que levam menos de 2 minutos.</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">Manhã / Tarde / Noite</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">Período do dia recomendado.</span>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {COLUMNS.map((col) => (
            <section
              key={col.id}
              className={`flex min-h-[320px] flex-col rounded-2xl border-2 p-3 transition-shadow ${col.accent} ${
                alvoDrop === col.id
                  ? "ring-2 ring-sky-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950"
                  : ""
              }`}
              aria-label={col.titulo}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
              }}
              onDrop={(e) => lidarComDropNoQuadrante(e, col.id)}
            >
              <div className="mb-3 flex items-start gap-2 border-b border-slate-200/90 pb-3 dark:border-slate-700/50">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {col.titulo}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-500">{col.subtitulo}</p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-600">
                    {porQuadrante(col.id).length} tarefa(s)
                  </p>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {porQuadrante(col.id).length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-600">
                    Largue aqui tarefas da fila ou arraste cartões de outros quadrantes.
                  </p>
                ) : (
                  porQuadrante(col.id).map((tarefa) => <TarefaCard key={tarefa.id} tarefa={tarefa} onConcluir={lidarComConclusao} onRestaurar={lidarComRestaurar} />)
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 border-t border-slate-200/90 pt-8 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Histórico do Agente
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Últimas decisões de classificação feitas pela IA.
              </p>
            </div>
            <button
              onClick={() => setMostrarHistoricoAgente((prev) => !prev)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-200 dark:hover:bg-ink-700"
            >
              {mostrarHistoricoAgente ? "Ocultar Histórico" : "Mostrar Histórico"}
            </button>
          </div>

          {mostrarHistoricoAgente && (
            carregandoHistorico ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando histórico...</p>
            ) : historicoAgente.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum histórico encontrado.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {historicoAgente.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-ink-800/60 dark:shadow-black/20">
                    <div className="mb-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                      {formatarData(item.criado_em)}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {item.output}
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
        </div>

        {tarefasConcluidas.length > 0 && (
          <div className="mt-12 border-t border-slate-200/90 pt-8 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tarefas Concluídas ({tarefasConcluidas.length})
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  O histórico de tudo que já foi finalizado.
                </p>
              </div>
              <button
                onClick={() => setMostrarConcluidas((prev) => !prev)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-200 dark:hover:bg-ink-700"
              >
                {mostrarConcluidas ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {mostrarConcluidas && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {tarefasConcluidas.map((tarefa) => (
                  <TarefaCard key={tarefa.id} tarefa={tarefa} onConcluir={lidarComConclusao} onRestaurar={lidarComRestaurar} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200/90 py-6 text-center text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-600">
        Matriz de Eisenhower (Symphony AI) — exemplo educativo (React + Express + PostgreSQL + LLM)
      </footer>
    </div>
  );
}
