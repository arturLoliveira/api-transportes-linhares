// Importações necessárias
const { PrismaClient, StatusColeta, StatusPagamento } = require('@prisma/client'); // Adicionar StatusPagamento
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

// --- Funções Auxiliares (simplificadas, peso é fixo para o teste) ---
function randomFloat(min, max, decimals) {
    const str = (Math.random() * (max - min) + min).toFixed(decimals);
    return parseFloat(str);
}
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Função Principal do Seed ---

async function main() {
    console.log("Iniciando o script de seed...");

    // 0. ZERAR O BANCO DE DADOS (CRÍTICO PARA LIMPEZA TOTAL)
    console.log('Zerando todas as tabelas...');
    await prisma.historicoRastreio.deleteMany({});
    await prisma.solicitacaoColeta.deleteMany({});
    await prisma.passwordResetToken.deleteMany({}); // Limpar tokens de senha, se existir
    await prisma.funcionario.deleteMany({}); // Limpar funcionários
    await prisma.cliente.deleteMany({}); // Limpar clientes
    console.log('Todas as tabelas foram limpas.');
    
    // --- Dados Fixos de Teste ---
    const adminEmail = "";
    const adminSenha = "";
    const adminNome = "";
    
    const clienteCpf = "";
    const clientesenha = "";
    const clienteEmail = ""
    const clienteNome = "";

    const senhaHash = await bcrypt.hash(adminSenha, 10);
    const clientehash = await bcrypt.hash(clientesenha, 10)

    // 1. Criação dos Usuários Fixos
    const admin = await prisma.funcionario.create({ // Não precisa de upsert após o deleteMany
        data: {
            email: adminEmail,
            senha: senhaHash,
            nome: adminNome
        }
    });

    await prisma.cliente.create({
        data: {
            cpfCnpj: clienteCpf,
            senha: clientehash,
            nome: clienteNome,
            email: clienteEmail
        }
    });

    console.log(`Usuário Admin (${admin.nome}) e Cliente (${clienteNome}) criados.`);

    // --- 2. Criação de APENAS UMA COLETAS DE TESTE ---
    const nfTeste = "NF-TESTE-100";
    const valorTeste = 150.00;
    
    const novaSolicitacao = await prisma.solicitacaoColeta.create({
        data: {
            nomeCliente: clienteNome,
            emailCliente: clienteEmail,
            enderecoColeta: 'Rua de Teste, 100, Ouro Branco, MG',
            tipoCarga: 'Caixa Única',
            cpfCnpjRemetente: clienteCpf, // Vinculado ao cliente fixo
            cpfCnpjDestinatario: clienteCpf,
            numeroNotaFiscal: nfTeste,
            valorFrete: valorTeste,
            pesoKg: 15.5,
            dataVencimento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Daqui a 7 dias
            status: StatusColeta.PENDENTE,
            statusPagamento: StatusPagamento.PENDENTE, // Define o status de pagamento
        }
    });

    const numeroEncomendaGerado = `OC-${1000 + novaSolicitacao.id}`;
    const driverTokenGerado = crypto.randomBytes(16).toString('hex');

    await prisma.solicitacaoColeta.update({
        where: { id: novaSolicitacao.id },
        data: {
            numeroEncomenda: numeroEncomendaGerado,
            driverToken: driverTokenGerado
        }
    });

    // Cria histórico inicial
    await prisma.historicoRastreio.create({
        data: {
            status: StatusColeta.PENDENTE,
            localizacao: 'Solicitação recebida pela transportadora',
            solicitacao: {
                connect: { numeroEncomenda: numeroEncomendaGerado }
            }
        }
    });


    console.log(`1 Coleta de Teste criada: NF ${nfTeste} - Encomenda ${numeroEncomendaGerado}`);
    console.log("Seed concluído com sucesso!");
}

// --- Execução ---

main()
    .catch((e) => {
        console.error("Erro durante o seed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
