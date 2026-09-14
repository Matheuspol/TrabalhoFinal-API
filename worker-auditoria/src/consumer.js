import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'tarefas.topic.exchange';
const QUEUE = 'tarefas.auditoria.queue';

const PADRAO_AUDITORIA = 'tarefa.#';

async function iniciar() {
  const conexao = await amqp.connect(RABBITMQ_URL);
  const canal = await conexao.createChannel();

  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertQueue(QUEUE, { durable: true });
  await canal.bindQueue(QUEUE, EXCHANGE, PADRAO_AUDITORIA);

  await canal.prefetch(1);
  console.log(`[auditoria] aguardando mensagens em ${QUEUE}`);

  await canal.consume(
    QUEUE,
    (mensagem) => {
      if (!mensagem) {
        return;
      }

      try {
        const evento = JSON.parse(mensagem.content.toString());
        console.log(
          `[auditoria] ${evento.ocorridoEm} | ${evento.tipo} | tarefaId=${evento.tarefaId} | titulo="${evento.titulo}"`,
        );
        canal.ack(mensagem);
      } catch (erro) {
        console.error('[auditoria] mensagem inválida:', erro.message);
        canal.nack(mensagem, false, false);
      }
    },
    { noAck: false },
  );
}

iniciar().catch((erro) => {
  console.error('[auditoria] falha ao iniciar consumer:', erro.message);
  process.exit(1);
});
