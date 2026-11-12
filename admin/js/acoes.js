// Ações usadas por várias telas: salvar o rascunho e tratar erros de um jeito só.

import { avisar } from './dom.js';
import { estado, salvarRascunho, temAlteracoesNaoSalvas } from './estado.js';

export function tratarErro(erro) {
  if (erro?.status === 401) {
    avisar('Sua sessão terminou. Entre de novo para continuar.', 'erro');
    setTimeout(() => location.reload(), 1200);
    return;
  }
  if (erro?.status === 409 && erro.dados?.rascunho) {
    avisar('O rascunho foi alterado em outra aba. Recarregue a página antes de salvar de novo.', 'erro');
    return;
  }
  const detalhes = erro?.dados?.erros?.length ? ` ${erro.dados.erros.join(' ')}` : '';
  avisar(`${erro?.message || 'Algo deu errado.'}${detalhes}`, 'erro');
  if (!erro?.status) console.error(erro);
}

export async function salvar() {
  if (estado.salvando || !temAlteracoesNaoSalvas()) return false;
  try {
    await salvarRascunho();
    avisar('Rascunho salvo. Ele só aparece no site depois de publicar.');
    return true;
  } catch (erro) {
    tratarErro(erro);
    return false;
  }
}
