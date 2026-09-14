# Trabalho Prático — API de Tarefas com Arquitetura Distribuída

API RESTful de tarefas (To-Do) com persistência em MongoDB, exposta atrás de
um API Gateway com rate limiting e load balancing, e integrada a um sistema
de mensageria com RabbitMQ.

## Como executar

Pré-requisitos: Docker Desktop (ou Docker Engine + plugin Compose).

```bash
docker compose up --build
```

Isso sobe 7 containers: MongoDB, RabbitMQ, duas instâncias da API de tarefas,
o gateway e dois workers consumidores de fila. Não é necessário nenhum passo
manual adicional.

Para derrubar tudo:

```bash
docker compose down
```

Para apagar também os dados persistidos (volume do Mongo):

```bash
docker compose down -v
```

## Portas utilizadas

| Serviço              | Porta no host | Descrição                                   |
|----------------------|---------------|----------------------------------------------|
| gateway              | 8080          | **Ponto de entrada único** da aplicação       |
| todo-api-1           | 3001          | Instância 1 da API (acesso direto, opcional)  |
| todo-api-2           | 3002          | Instância 2 da API (acesso direto, opcional)  |
| mongo                | 27017         | MongoDB (inspeção via `mongosh`, opcional)    |
| rabbitmq             | 5672          | Protocolo AMQP                                |
| rabbitmq (management)| 15672         | Painel web (usuário/senha: `guest`/`guest`)   |

## Variáveis de ambiente

Já vêm configuradas no `docker-compose.yml`, mas podem ser sobrescritas:

| Variável            | Serviço        | Padrão                                              |
|---------------------|----------------|------------------------------------------------------|
| `MONGO_URL`         | todo-api-*     | `mongodb://mongo:27017/tarefas`                       |
| `RABBITMQ_URL`      | todo-api-*, workers | `amqp://guest:guest@rabbitmq:5672`               |
| `TODO_API_TARGETS`  | gateway        | `http://todo-api-1:3000,http://todo-api-2:3000`       |
| `GATEWAY_PORT`      | gateway        | `8080`                                                |
| `INSTANCE_NAME`     | todo-api-*     | `todo-api-1` / `todo-api-2`                           |

## Endpoints (via gateway, `http://localhost:8080`)

Todas as chamadas ao recurso de tarefas passam por `/api/tarefas`, que o
gateway traduz para `/tarefas` na instância escolhida.

| Método | Rota                  | Descrição              |
|--------|-----------------------|-------------------------|
| POST   | `/api/tarefas`         | Cria uma tarefa          |
| GET    | `/api/tarefas`         | Lista todas as tarefas   |
| GET    | `/api/tarefas/:id`     | Busca uma tarefa por id  |
| PUT    | `/api/tarefas/:id`     | Atualiza uma tarefa      |
| DELETE | `/api/tarefas/:id`     | Remove uma tarefa        |

Exemplo:

```bash
curl -i -X POST http://localhost:8080/api/tarefas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Estudar para a prova","descricao":"Revisar RabbitMQ"}'

curl -i http://localhost:8080/api/tarefas
```

## Decisões de arquitetura

O trabalho implementa as **2 opções** de arquitetura distribuída sobre a API
obrigatória de CRUD (recurso "tarefa", persistido em MongoDB):

### 1) API Gateway com Rate Limit e Load Balancer

O serviço `gateway` (Express) é o único ponto de entrada da aplicação. Ele:

- **Roteia** todas as chamadas em `/api/tarefas*` para uma das duas
  instâncias da `todo-api` (round-robin simples, alternando a cada
  requisição).
- **Aplica rate limiting** (`express-rate-limit`) de 5 requisições a cada
  10 segundos por cliente (identificado pelo header `X-Client-Id`, com
  fallback para o IP). Ao estourar o limite, responde `429 Too Many
  Requests`.
- Devolve o header `X-Upstream-Instance` (qual endereço atendeu) e cada
  instância da API responde com `X-Served-By`, o que permite comprovar o
  balanceamento observando as respostas.

Como as duas instâncias da `todo-api` usam o **mesmo MongoDB**, o estado
(tarefas) é compartilhado — o balanceamento de carga não causa
inconsistência de dados entre as instâncias.

### 2) Mensageria com RabbitMQ

A `todo-api` publica eventos de domínio (`tarefa.criada`,
`tarefa.atualizada`, `tarefa.concluida`, `tarefa.removida`) em uma
**topic exchange** (`tarefas.topic.exchange`), sem bloquear a resposta HTTP
se o RabbitMQ estiver indisponível.

Duas filas com propósitos distintos consomem esses eventos:

- **`tarefas.notificacoes.queue`** — associada às routing keys
  `tarefa.criada` e `tarefa.concluida`. Simula o envio de uma notificação ao
  usuário final (`worker-notificacoes`).
- **`tarefas.auditoria.queue`** — associada ao padrão `tarefa.#`, captura
  **todos** os eventos da tarefa. Registra uma trilha de auditoria
  (`worker-auditoria`).

Isso demonstra tanto producer/consumer quanto roteamento seletivo (uma fila
recebe um subconjunto dos eventos, a outra recebe todos).

Painel do RabbitMQ para inspecionar exchange, filas e bindings:
`http://localhost:15672` (usuário/senha `guest`/`guest`).

### Por que não Loki/Grafana

A terceira opção (telemetria com Loki) foi deixada de fora conscientemente:
exigiria configurar coleta de logs (Promtail), datasource e dashboards no
Grafana, aumentando bastante a superfície de containers e configuração sem
agregar um conceito novo de arquitetura distribuída em relação às duas
opções já escolhidas.

## Testando o rate limit e o load balancing

```bash
# Seis chamadas com o mesmo cliente em menos de 10s: a 6ª deve receber 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -H "X-Client-Id: demo" http://localhost:8080/api/tarefas
done

# Observar o load balancing entre as instâncias (X-Upstream-Instance alterna)
curl -sI http://localhost:8080/api/tarefas | grep -i x-upstream-instance
curl -sI http://localhost:8080/api/tarefas | grep -i x-upstream-instance
```

## Testando a mensageria

```bash
docker compose logs -f worker-notificacoes worker-auditoria
```

Em outro terminal, crie e conclua uma tarefa — os logs dos dois workers
devem reagir aos eventos publicados pela `todo-api`.

## Estrutura do repositório

```text
trabalho-apis-tarefas/
├── docker-compose.yml
├── README.md
├── todo-api/              # CRUD de tarefas + publisher RabbitMQ (Node/Express/Mongoose)
├── gateway/               # API Gateway: rate limit + load balancing (Node/Express)
├── worker-notificacoes/   # Consumer RabbitMQ (fila de notificações)
└── worker-auditoria/      # Consumer RabbitMQ (fila de auditoria)
```
