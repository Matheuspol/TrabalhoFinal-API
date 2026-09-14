import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

let conexaoPromise;

function obterConexao() {
  if (!conexaoPromise) {
    conexaoPromise = amqp.connect(RABBITMQ_URL).catch((erro) => {
      conexaoPromise = undefined;
      throw erro;
    });
  }

  return conexaoPromise;
}

export async function criarCanal() {
  const conexao = await obterConexao();
  return conexao.createChannel();
}
