import { randomUUID } from 'node:crypto';
import { criarCanal } from './connection.js';

export const EXCHANGE_TAREFAS = 'tarefas.topic.exchange';

export async function publicarEvento(tipo, tarefa) {
  try {
    const canal = await criarCanal();

    try {
      await canal.assertExchange(EXCHANGE_TAREFAS, 'topic', { durable: true });

      const evento = {
        eventId: randomUUID(),
        tipo,
        tarefaId: tarefa._id?.toString() ?? tarefa.id,
        titulo: tarefa.titulo,
        concluida: tarefa.concluida,
        ocorridoEm: new Date().toISOString(),
      };

      canal.publish(EXCHANGE_TAREFAS, tipo, Buffer.from(JSON.stringify(evento)), {
        contentType: 'application/json',
        persistent: true,
        type: tipo,
        messageId: evento.eventId,
      });
    } finally {
      await canal.close();
    }
  } catch (erro) {
    console.error(`Falha ao publicar evento "${tipo}" no RabbitMQ:`, erro.message);
  }
}
