import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'tarefas.topic.exchange';
const QUEUE = 'tarefas.notificacoes.queue';

const PADROES_DE_INTERESSE = ['tarefa.criada', 'tarefa.concluida'];

async function iniciar() {
  const conexao = await amqp.connect(RABBITMQ_URL);
  const canal = await conexao.createChannel();

  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertQueue(QUEUE, { durable: true });

  for (const padrao of PADROES_DE_INTERESSE) {
    await canal.bindQueue(QUEUE, EXCHANGE, padrao);
  }

  await canal.prefetch(1);
  console.log(`[notificacoes] aguardando mensagens em ${QUEUE}`);

  await canal.consume(
    QUEUE,
    (mensagem) => {
      if (!mensagem) {
        return;
      }

      try {
        const evento = JSON.parse(mensagem.content.toString());
        console.log(
          `[notificacoes] notificaria o usuário: tarefa "${evento.titulo}" -> ${evento.tipo}`,
        );
        canal.ack(mensagem);
      } catch (erro) {
        console.error('[notificacoes] mensagem inválida:', erro.message);
        canal.nack(mensagem, false, false);
      }
    },
    { noAck: false },
  );
}

iniciar().catch((erro) => {
  console.error('[notificacoes] falha ao iniciar consumer:', erro.message);
  process.exit(1);
});
