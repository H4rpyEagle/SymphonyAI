import express from 'express';
import app from '../backend/server.js';

// Na Vercel, as requisições chegam com o prefixo /api (ex: /api/tarefas).
// Como o backend localmente não usa esse prefixo nas rotas (o Vite quem remove),
// nós criamos um mini-aplicativo na Vercel que monta o backend na rota /api.
const vApp = express();
vApp.use('/api', app);

export default vApp;
