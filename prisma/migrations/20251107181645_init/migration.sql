-- CreateEnum
CREATE TYPE "StatusColeta" AS ENUM ('PENDENTE', 'COLETADO', 'EM_TRANSITO', 'EM_ROTA_ENTREGA', 'CONCLUIDA', 'CANCELADA', 'EM_DEVOLUCAO');

-- CreateTable
CREATE TABLE "solicitacoes_coleta" (
    "id" SERIAL NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "emailCliente" TEXT NOT NULL,
    "enderecoColeta" TEXT NOT NULL,
    "tipoCarga" TEXT,
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusColeta" NOT NULL DEFAULT 'PENDENTE',
    "numeroEncomenda" TEXT,
    "cpfCnpjRemetente" TEXT NOT NULL,
    "cpfCnpjDestinatario" TEXT NOT NULL,
    "numeroNotaFiscal" TEXT NOT NULL,
    "valorFrete" DOUBLE PRECISION NOT NULL,
    "pesoKg" DOUBLE PRECISION,
    "dataVencimento" TIMESTAMP(3),
    "boletoUrl" TEXT,
    "boletoLinhaDigitavel" TEXT,
    "boletoStatusPagamento" TEXT,
    "driverToken" TEXT,

    CONSTRAINT "solicitacoes_coleta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_devolucao" (
    "id" SERIAL NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "emailCliente" TEXT NOT NULL,
    "numeroNFOriginal" TEXT NOT NULL,
    "motivoDevolucao" TEXT,
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusProcessamento" TEXT,
    "motivoRejeicao" TEXT,

    CONSTRAINT "solicitacoes_devolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "cpfCnpj" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nome" TEXT,
    "email" TEXT,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_rastreio" (
    "id" SERIAL NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "localizacao" TEXT NOT NULL,
    "solicitacaoId" INTEGER NOT NULL,

    CONSTRAINT "historico_rastreio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_coleta_numeroEncomenda_key" ON "solicitacoes_coleta"("numeroEncomenda");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_coleta_numeroNotaFiscal_key" ON "solicitacoes_coleta"("numeroNotaFiscal");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_coleta_driverToken_key" ON "solicitacoes_coleta"("driverToken");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_email_key" ON "Funcionario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cpfCnpj_key" ON "clientes"("cpfCnpj");

-- AddForeignKey
ALTER TABLE "historico_rastreio" ADD CONSTRAINT "historico_rastreio_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "solicitacoes_coleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
