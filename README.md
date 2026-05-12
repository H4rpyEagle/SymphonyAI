# Symphony AI 🚀

Organizador de tarefas baseado na **Matriz de Eisenhower**, com Inteligência Artificial para classificar urgência e importância automaticamente.

## Tecnologias
- **Frontend:** React + Tailwind
- **Backend:** Node.js + Express
- **Banco de Dados:** PostgreSQL
- **IA & Automação:** DeepSeek + n8n

## Pastas do Projeto
- 📂 `/frontend`: A interface web (telas e cartões).
- 📂 `/backend`: O servidor e conexão com Banco.
- 📂 `/database`: Estrutura do banco de dados (SQL).
- 📂 `/n8n`: Fluxos de automação (importar no seu n8n).

## Como Rodar

1. **Configure o Banco e IA:**
   Crie um `.env` na pasta `/backend` (veja `.env.example`) com sua URL do PostgreSQL e a chave da OpenAI.
   
2. **Instale:**
   Abra o terminal, entre em `backend` e rode `npm install`. Depois, faça o mesmo na pasta `frontend`.

3. **Inicie:**
   Dê dois cliques no arquivo `Iniciar Projeto.bat` para rodar tudo ao mesmo tempo.
   *(Ou inicie separadamente: `node server.js` no backend e `npm run dev` no frontend).*
