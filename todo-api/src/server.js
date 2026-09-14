import express from 'express';
import mongoose from 'mongoose';
import tarefasRouter from './routes/tarefas.js';

const app = express();
app.use(express.json());

const PORTA = process.env.PORT ?? 3000;
const NOME_INSTANCIA = process.env.INSTANCE_NAME ?? 'todo-api';
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017/tarefas';

app.use((request, response, next) => {
  response.set('X-Served-By', NOME_INSTANCIA);
  next();
});

app.get('/health', (request, response) => {
  response.json({ status: 'ok', instancia: NOME_INSTANCIA });
});

app.use('/tarefas', tarefasRouter);

app.use((request, response) => {
  response.status(404).json({ erro: 'Rota não encontrada.' });
});

async function iniciar() {
  await mongoose.connect(MONGO_URL);
  app.listen(PORTA, () => {
    console.log(`${NOME_INSTANCIA} disponível em http://localhost:${PORTA}`);
  });
}

iniciar().catch((erro) => {
  console.error('Falha ao iniciar a API de tarefas:', erro);
  process.exit(1);
});
