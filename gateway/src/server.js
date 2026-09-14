import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

const app = express();

const PORTA_GATEWAY = process.env.GATEWAY_PORT ?? 8080;
const ALVOS = (process.env.TODO_API_TARGETS ?? 'http://localhost:3001,http://localhost:3002')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

let proximoIndice = 0;
function escolherAlvo() {
  const alvo = ALVOS[proximoIndice];
  proximoIndice = (proximoIndice + 1) % ALVOS.length;
  return alvo;
}

app.use(cors({ exposedHeaders: '*' }));
app.use(express.raw({ type: '*/*', limit: '2mb' }));

const limiteTarefas = rateLimit({
  windowMs: 10_000,
  limit: 5,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: (request) => request.get('X-Client-Id') || request.ip,
  message: {
    erro: 'Limite de requisições excedido. Tente novamente mais tarde.',
  },
});

app.use('/api/tarefas', limiteTarefas);

app.all(['/api/tarefas', '/api/tarefas/*splat'], async (request, response) => {
  const alvo = escolherAlvo();
  const caminhoDestino = request.originalUrl.replace(/^\/api\/tarefas/, '/tarefas');
  const destino = `${alvo}${caminhoDestino}`;
  const semCorpo = ['GET', 'HEAD'].includes(request.method);

  try {
    const respostaDoServico = await fetch(destino, {
      method: request.method,
      headers: {
        'Content-Type': request.get('Content-Type') || 'application/json',
      },
      body: semCorpo ? undefined : request.body,
    });

    const corpo = await respostaDoServico.text();

    response.status(respostaDoServico.status);
    response.set('Content-Type', respostaDoServico.headers.get('content-type') ?? 'application/json');
    response.set('X-Upstream-Instance', alvo);
    response.send(corpo);
  } catch (erro) {
    response.status(502).json({ erro: 'A API de tarefas está indisponível.', detalhe: erro.message });
  }
});

app.use((request, response) => {
  response.status(404).json({ erro: 'Rota não encontrada no gateway.' });
});

app.listen(PORTA_GATEWAY, () => {
  console.log(`Gateway disponível em http://localhost:${PORTA_GATEWAY}`);
  console.log(`Balanceando entre: ${ALVOS.join(', ')}`);
});
