import { Router } from 'express';
import Tarefa from '../models/Tarefa.js';
import { publicarEvento } from '../rabbitmq/publisher.js';

const router = Router();

router.post('/', async (request, response) => {
  try {
    const tarefa = await Tarefa.create({
      titulo: request.body.titulo,
      descricao: request.body.descricao ?? '',
      prazo: request.body.prazo ?? null,
    });

    await publicarEvento('tarefa.criada', tarefa);
    response.status(201).json(tarefa);
  } catch (erro) {
    response.status(400).json({ erro: erro.message });
  }
});

router.get('/', async (request, response) => {
  const tarefas = await Tarefa.find().sort({ criadaEm: -1 });
  response.json(tarefas);
});

router.get('/:id', async (request, response) => {
  const tarefa = await Tarefa.findById(request.params.id).catch(() => null);
  if (!tarefa) {
    return response.status(404).json({ erro: 'Tarefa não encontrada.' });
  }
  response.json(tarefa);
});

router.put('/:id', async (request, response) => {
  const tarefa = await Tarefa.findById(request.params.id).catch(() => null);
  if (!tarefa) {
    return response.status(404).json({ erro: 'Tarefa não encontrada.' });
  }

  const estavaConcluida = tarefa.concluida;

  tarefa.titulo = request.body.titulo ?? tarefa.titulo;
  tarefa.descricao = request.body.descricao ?? tarefa.descricao;
  tarefa.prazo = request.body.prazo ?? tarefa.prazo;
  tarefa.concluida = request.body.concluida ?? tarefa.concluida;
  await tarefa.save();

  await publicarEvento('tarefa.atualizada', tarefa);
  if (!estavaConcluida && tarefa.concluida) {
    await publicarEvento('tarefa.concluida', tarefa);
  }

  response.json(tarefa);
});

router.delete('/:id', async (request, response) => {
  const tarefa = await Tarefa.findByIdAndDelete(request.params.id).catch(() => null);
  if (!tarefa) {
    return response.status(404).json({ erro: 'Tarefa não encontrada.' });
  }

  await publicarEvento('tarefa.removida', tarefa);
  response.status(204).send();
});

export default router;
