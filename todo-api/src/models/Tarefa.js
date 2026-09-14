import mongoose from 'mongoose';

const tarefaSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String, default: '' },
  concluida: { type: Boolean, default: false },
  prazo: { type: Date, default: null },
  criadaEm: { type: Date, default: Date.now },
});

export default mongoose.model('Tarefa', tarefaSchema);
