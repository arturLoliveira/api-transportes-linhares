-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO');

-- DropForeignKey
ALTER TABLE "public"."historico_rastreio" DROP CONSTRAINT "historico_rastreio_solicitacaoId_fkey";

-- AlterTable
ALTER TABLE "solicitacoes_coleta" ADD COLUMN     "statusPagamento" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE';

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "clienteCpfCnpj" TEXT NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- AddForeignKey
ALTER TABLE "solicitacoes_coleta" ADD CONSTRAINT "solicitacoes_coleta_cpfCnpjDestinatario_fkey" FOREIGN KEY ("cpfCnpjDestinatario") REFERENCES "clientes"("cpfCnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_clienteCpfCnpj_fkey" FOREIGN KEY ("clienteCpfCnpj") REFERENCES "clientes"("cpfCnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_rastreio" ADD CONSTRAINT "historico_rastreio_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "solicitacoes_coleta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
