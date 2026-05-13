import dns from "node:dns";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import pg from "pg";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Raiz do repo .env opcional; backend/.env tem prioridade */
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

/* Preferir IPv4 quando existir A + AAAA (útil com pooler Supabase em redes mistas) */
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* ignore */
}

const { Pool } = pg;

function poolSsl() {
  const url = process.env.DATABASE_URL || "";
  if (process.env.PGSSL === "false") return undefined;
  if (process.env.PGSSL === "true" || /supabase\.co|pooler\.supabase\.com/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: poolSsl(),
});

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

const ALLOWED_STATUS = ["a_fazer", "em_progresso", "concluido"];
const ALLOWED_QUADRANT = ["pendente", "Q1", "Q2", "Q3", "Q4"];
const ALLOWED_TIME = ["Manhã", "Tarde", "Noite"];

const RETURNING_LIST = `RETURNING id, titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status, criado_em`;

/* =========================================================================
   OPENAI / LLM SERVICE
   ========================================================================= */

const SYSTEM_PROMPT = `És um assistente de produtividade. Analisas texto livre (tarefas "caóticas") e devolves APENAS um objeto JSON válido, sem markdown.

Regras:
- quadrante: "Q1" (urgente+importante), "Q2" (não urgente mas importante — planeamento), "Q3" (urgente mas pouco importante — delegar), "Q4" (nem urgente nem importante — eliminar/minimizar).
- e_pareto: true apenas se a tarefa for claramente de alto impacto (contribui desproporcionalmente para resultados — regra 80/20). Caso contrário false.
- horario_sugerido: "Manhã" (tarefas cognitivamente pesadas ou estratégicas), "Tarde" (média complexidade), "Noite" (baixa complexidade ou rotina leve).
- regra_dois_minutos: true se for plausível concluir em menos de 2 minutos; false caso contrário.

Formato exato das chaves:
{"titulo":"string curta","descricao":"string com contexto/resumo","quadrante":"Q1"|"Q2"|"Q3"|"Q4","e_pareto":boolean,"horario_sugerido":"Manhã"|"Tarde"|"Noite","regra_dois_minutos":boolean}`;

function buildClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Defina DEEPSEEK_API_KEY (ou OPENAI_API_KEY) no .env");
  }
  const baseURL = process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  return new OpenAI({ apiKey, baseURL });
}

async function classifyTaskWithLLM(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) throw new Error("Texto vazio");

  const client = buildClient();
  const model = process.env.LLM_MODEL?.trim() || "deepseek-chat";

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia do modelo");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("JSON inválido devolvido pelo modelo");
  }

  const quadrante = normalizeQuadrant(parsed.quadrante);
  const horario_sugerido = normalizeTime(parsed.horario_sugerido);
  const e_dois_minutos = parsed.regra_dois_minutos === true;

  return {
    titulo: String(parsed.titulo || text.slice(0, 120)).slice(0, 500),
    descricao: String(parsed.descricao || text).slice(0, 4000),
    quadrante,
    e_pareto: Boolean(parsed.e_pareto),
    horario_sugerido,
    e_dois_minutos,
  };
}

function normalizeQuadrant(q) {
  const v = String(q || "").toUpperCase();
  if (["Q1", "Q2", "Q3", "Q4"].includes(v)) return v;
  return "Q2";
}

function normalizeTime(t) {
  const v = String(t || "").trim();
  if (v === "Manhã" || v === "Tarde" || v === "Noite") return v;
  return "Tarde";
}

/* =========================================================================
   EXPRESS APP & ROUTES
   ========================================================================= */

function extractUserText(body) {
  if (!body || typeof body !== "object") return "";
  const candidates = [
    body.text,
    body.message,
    body.content,
    body.body,
    body.input,
    body.task,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (Array.isArray(body.messages) && body.messages.length) {
    const last = body.messages[body.messages.length - 1];
    if (last?.text) return String(last.text).trim();
    if (last?.body) return String(last.body).trim();
  }
  return "";
}

function isUuid(s) {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s
    )
  );
}

/** GET / — índice dos endpoints */
app.get("/", (_req, res) => {
  res.json({
    service: "Symphony AI API",
    endpoints: {
      "GET /health": "estado; GET /health?db=1 testa Postgres",
      "GET /": "esta lista",
      "GET /tarefas": "listar tarefas (?quadrante, ?status, ?q, ?limit, ?offset, ?total=1)",
      "GET /tarefas/:id": "detalhe de uma tarefa",
      "POST /tarefas": "criar (body.text + IA OU body.titulo manual)",
      "PATCH /tarefas/:id": "atualizar campos parciais",
      "POST /tarefas/:id/classify": "reclassificar com IA (body.text opcional)",
      "DELETE /tarefas/:id": "apagar tarefa",
      "POST /webhook": "entrada n8n / WhatsApp (texto livre → IA → grava)",
    },
    enums: { quadrante: ALLOWED_QUADRANT, status: ALLOWED_STATUS, horario_sugerido: ALLOWED_TIME },
  });
});

/** GET /health — ?db=1 testa ligação ao Postgres */
app.get("/health", async (req, res) => {
  const base = {
    ok: true,
    service: "symphony-ai-api",
    ts: new Date().toISOString(),
  };
  if (!process.env.DATABASE_URL?.trim()) {
    return res.status(503).json({
      ...base,
      ok: false,
      database: "missing",
      hint: "Crie backend/.env com DATABASE_URL (ver backend/.env.example).",
    });
  }
  if (req.query.db !== "1" && req.query.db !== "true") {
    return res.json({ ...base, database: "configured" });
  }
  try {
    await pool.query("SELECT 1");
    return res.json({ ...base, database: "connected" });
  } catch (err) {
    console.error("[GET /health?db=1]", err.message);
    return res.status(503).json({
      ...base,
      ok: false,
      database: "error",
      error: err.message || "Falha na ligação à base de dados",
    });
  }
});

/** GET /historico — listar as decisões do agente */
app.get("/historico", async (req, res) => {
  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({ error: "DATABASE_URL não definido." });
    }
    const r = await pool.query(
      `SELECT id, criado_em, output FROM historico_agente ORDER BY criado_em DESC LIMIT 50`
    );
    return res.json({ historico: r.rows });
  } catch (err) {
    console.error("[GET /historico]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** GET /tarefas */
app.get("/tarefas", async (req, res) => {
  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({
        error:
          "DATABASE_URL não definido. Copie backend/.env.example para backend/.env e preencha a URI do Supabase.",
      });
    }
    const { quadrante, status, q, total } = req.query;
    const limitRaw = parseInt(String(req.query.limit ?? ""), 10);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : null;

    if (quadrante !== undefined && quadrante !== "" && !ALLOWED_QUADRANT.includes(quadrante)) {
      return res.status(400).json({ error: "quadrante inválido", allowed: ALLOWED_QUADRANT });
    }
    if (status !== undefined && status !== "" && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: "status inválido", allowed: ALLOWED_STATUS });
    }

    const conditions = [];
    const params = [];
    let n = 1;

    if (quadrante) {
      conditions.push(`quadrante = $${n++}::quadrante_tarefa`);
      params.push(quadrante);
    }
    if (status) {
      conditions.push(`status = $${n++}::status_tarefa`);
      params.push(status);
    }
    if (q && String(q).trim()) {
      conditions.push(`(titulo ILIKE $${n} OR descricao ILIKE $${n})`);
      params.push(`%${String(q).trim()}%`);
      n++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    let fullTotal = null;
    if (total === "1" || total === "true") {
      const c = await pool.query(
        `SELECT count(*)::int AS c FROM tarefas ${where}`,
        params
      );
      fullTotal = c.rows[0]?.c ?? 0;
    }

    const limitSql = limit != null ? `LIMIT $${n++} OFFSET $${n++}` : "";
    const listParams = [...params];
    if (limit != null) {
      listParams.push(limit, offset);
    }

    const r = await pool.query(
      `SELECT id, titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status, criado_em
       FROM tarefas ${where}
       ORDER BY criado_em DESC
       ${limitSql}`,
      listParams
    );

    const payload = { tarefas: r.rows };
    if (fullTotal !== null) {
      payload.total = fullTotal;
      payload.limit = limit ?? r.rows.length;
      payload.offset = limit != null ? offset : 0;
    }
    return res.json(payload);
  } catch (err) {
    console.error("[GET /tarefas]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** GET /tarefas/:id */
app.get("/tarefas/:id", async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: "id inválido (esperado UUID)" });
    }
    const r = await pool.query(
      `SELECT id, titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status, criado_em
       FROM tarefas WHERE id = $1::uuid`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: "Tarefa não encontrada" });
    return res.json({ task: r.rows[0] });
  } catch (err) {
    console.error("[GET /tarefas/:id]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** POST /tarefas */
app.post("/tarefas", async (req, res) => {
  try {
    const body = req.body || {};
    const useLlm =
      typeof body.text === "string" && body.text.trim() && body.classify !== false;

    if (useLlm) {
      const classified = await classifyTaskWithLLM(body.text.trim());
      const statusIns = ALLOWED_STATUS.includes(body.status) ? body.status : "a_fazer";
      const insert = await pool.query(
        `INSERT INTO tarefas (titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status)
         VALUES ($1, $2, $3::quadrante_tarefa, $4, $5, $6, $7::status_tarefa)
         ${RETURNING_LIST}`,
        [
          classified.titulo,
          classified.descricao,
          classified.quadrante,
          classified.e_pareto,
          classified.horario_sugerido,
          classified.e_dois_minutos,
          statusIns,
        ]
      );
      return res.status(201).json({ ok: true, task: insert.rows[0] });
    }

    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    if (!titulo) {
      return res.status(400).json({
        error: "Envie 'text' para classificar com IA ou 'titulo' para criar manualmente.",
      });
    }

    const descricao =
      typeof body.descricao === "string" ? body.descricao : "";
    const quadrante = ALLOWED_QUADRANT.includes(body.quadrante) ? body.quadrante : "pendente";
    const e_pareto = Boolean(body.e_pareto);
    const e_dois_minutos = Boolean(body.e_dois_minutos);
    const horario_sugerido = ALLOWED_TIME.includes(body.horario_sugerido)
      ? body.horario_sugerido
      : "Tarde";
    const status = ALLOWED_STATUS.includes(body.status) ? body.status : "a_fazer";

    const insert = await pool.query(
      `INSERT INTO tarefas (titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status)
       VALUES ($1, $2, $3::quadrante_tarefa, $4, $5, $6, $7::status_tarefa)
       ${RETURNING_LIST}`,
      [titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status]
    );
    return res.status(201).json({ ok: true, task: insert.rows[0] });
  } catch (err) {
    console.error("[POST /tarefas]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** PATCH /tarefas/:id */
app.patch("/tarefas/:id", async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: "id inválido (esperado UUID)" });
    }
    const body = req.body || {};
    const fields = [];
    const values = [];
    let n = 1;

    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return res.status(400).json({ error: "status inválido", allowed: ALLOWED_STATUS });
      }
      fields.push(`status = $${n++}::status_tarefa`);
      values.push(body.status);
    }
    if (body.quadrante !== undefined) {
      if (!ALLOWED_QUADRANT.includes(body.quadrante)) {
        return res.status(400).json({ error: "quadrante inválido", allowed: ALLOWED_QUADRANT });
      }
      fields.push(`quadrante = $${n++}::quadrante_tarefa`);
      values.push(body.quadrante);
    }
    if (body.titulo !== undefined) {
      const t = String(body.titulo).trim();
      if (!t) return res.status(400).json({ error: "titulo não pode ser vazio" });
      fields.push(`titulo = $${n++}`);
      values.push(t.slice(0, 500));
    }
    if (body.descricao !== undefined) {
      fields.push(`descricao = $${n++}`);
      values.push(String(body.descricao).slice(0, 4000));
    }
    if (body.e_pareto !== undefined) {
      fields.push(`e_pareto = $${n++}`);
      values.push(Boolean(body.e_pareto));
    }
    if (body.e_dois_minutos !== undefined) {
      fields.push(`e_dois_minutos = $${n++}`);
      values.push(Boolean(body.e_dois_minutos));
    }
    if (body.horario_sugerido !== undefined) {
      if (!ALLOWED_TIME.includes(body.horario_sugerido)) {
        return res.status(400).json({ error: "horario_sugerido inválido", allowed: ALLOWED_TIME });
      }
      fields.push(`horario_sugerido = $${n++}`);
      values.push(body.horario_sugerido);
    }

    if (!fields.length) {
      return res.status(400).json({
        error:
          "Nenhum campo para atualizar. Use: status, quadrante, titulo, descricao, e_pareto, e_dois_minutos, horario_sugerido.",
      });
    }

    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE tarefas SET ${fields.join(", ")} WHERE id = $${n}::uuid ${RETURNING_LIST}`,
      values
    );
    if (!r.rowCount) return res.status(404).json({ error: "Tarefa não encontrada" });
    return res.json({ task: r.rows[0] });
  } catch (err) {
    console.error("[PATCH /tarefas/:id]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});



/** POST /tarefas/:id/classify — reexecuta IA sobre a tarefa */
app.post("/tarefas/:id/classify", async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: "id inválido (esperado UUID)" });
    }
    const cur = await pool.query(
      `SELECT titulo, descricao FROM tarefas WHERE id = $1::uuid`,
      [req.params.id]
    );
    if (!cur.rowCount) return res.status(404).json({ error: "Tarefa não encontrada" });

    const body = req.body || {};
    const raw =
      typeof body.text === "string" && body.text.trim()
        ? body.text.trim()
        : `${cur.rows[0].titulo}\n${cur.rows[0].descricao || ""}`.trim();

    const classified = await classifyTaskWithLLM(raw);

    const r = await pool.query(
      `UPDATE tarefas SET
         titulo = $1,
         descricao = $2,
         quadrante = $3::quadrante_tarefa,
         e_pareto = $4,
         horario_sugerido = $5,
         e_dois_minutos = $6
       WHERE id = $7::uuid
       ${RETURNING_LIST}`,
      [
        classified.titulo,
        classified.descricao,
        classified.quadrante,
        classified.e_pareto,
        classified.horario_sugerido,
        classified.e_dois_minutos,
        req.params.id,
      ]
    );
    return res.json({ ok: true, task: r.rows[0] });
  } catch (err) {
    console.error("[POST /tarefas/:id/classify]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** DELETE /tarefas/:id */
app.delete("/tarefas/:id", async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ error: "id inválido (esperado UUID)" });
    }
    const r = await pool.query(`DELETE FROM tarefas WHERE id = $1::uuid RETURNING id`, [
      req.params.id,
    ]);
    if (!r.rowCount) return res.status(404).json({ error: "Tarefa não encontrada" });
    return res.status(204).send();
  } catch (err) {
    console.error("[DELETE /tarefas/:id]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

/** POST /webhook — n8n / WhatsApp */
app.post("/webhook", async (req, res) => {
  try {
    const raw = extractUserText(req.body);
    if (!raw) {
      return res.status(400).json({
        error:
          "Envie texto em 'text', 'message', 'body' ou campos semelhantes no JSON.",
      });
    }

    const classified = await classifyTaskWithLLM(raw);

    const insert = await pool.query(
      `INSERT INTO tarefas (titulo, descricao, quadrante, e_pareto, horario_sugerido, e_dois_minutos, status)
       VALUES ($1, $2, $3::quadrante_tarefa, $4, $5, $6, 'a_fazer'::status_tarefa)
       ${RETURNING_LIST}`,
      [
        classified.titulo,
        classified.descricao,
        classified.quadrante,
        classified.e_pareto,
        classified.horario_sugerido,
        classified.e_dois_minutos,
      ]
    );

    return res.status(201).json({ ok: true, task: insert.rows[0] });
  } catch (err) {
    console.error("[webhook]", err.message);
    return res.status(500).json({ error: err.message || "Erro no servidor" });
  }
});

const PORT = Number(process.env.PORT) || 3001;

// Se não estiver rodando dentro da Vercel, inicia o servidor localmente na porta 3001
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Symphony AI API em http://localhost:${PORT}`);
  });
}

// Exporta o app Express para a Vercel Serverless Functions
export default app;
