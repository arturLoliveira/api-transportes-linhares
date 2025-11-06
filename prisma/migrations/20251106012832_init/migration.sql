-- AlterEnum
ALTER TYPE "StatusColeta" ADD VALUE 'EM_DEVOLUCAO';

-- DropForeignKey
ALTER TABLE "public"."historico_rastreio" DROP CONSTRAINT "historico_rastreio_solicitacaoId_fkey";

-- AddForeignKey
ALTER TABLE "historico_rastreio" ADD CONSTRAINT "historico_rastreio_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "solicitacoes_coleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
