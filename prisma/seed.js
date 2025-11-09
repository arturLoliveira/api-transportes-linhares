// Importações necessárias
const { PrismaClient, StatusColeta } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

// --- Funções Auxiliares para gerar dados aleatórios ---

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals) {
    const str = (Math.random() * (max - min) + min).toFixed(decimals);
    return parseFloat(str);
}

function randomCPF() {
    return `${randomInt(100, 999)}.${randomInt(100, 999)}.${randomInt(100, 999)}-${randomInt(10, 99)}`;
}

function randomNF() {
    return randomInt(100000, 999999).toString();
}

const nomes = ['Ana Silva', 'Bruno Costa', 'Carla Dias', 'Daniel Moreira', 'Elisa Fernandes', 'Fábio Guedes', 'Gabriela Lima'];
const sobrenomes = ['Pereira', 'Oliveira', 'Santos', 'Souza', 'Rodrigues', 'Alves', 'Gomes'];
function randomName() {
    return `${nomes[randomInt(0, nomes.length - 1)]} ${sobrenomes[randomInt(0, sobrenomes.length - 1)]}`;
}

const cidades = ['Ouro Branco, MG', 'Conselheiro Lafaiete, MG', 'Belo Horizonte, MG', 'Viçosa, MG', 'Mariana, MG'];
function randomAddress() {
    return `Rua ${randomName().split(' ')[0]}, ${randomInt(1, 1000)}, ${cidades[randomInt(0, cidades.length - 1)]}`;
}

const statuses = Object.values(StatusColeta);
function randomStatus() {
    // Garante que a maioria seja PENDENTE ou EM_TRANSITO
    const S = statuses[randomInt(0, statuses.length - 1)];
    const chance = Math.random();
    if (chance < 0.4) return StatusColeta.PENDENTE;
    if (chance < 0.7) return StatusColeta.EM_TRANSITO;
    return S;
}

// --- Função Principal do Seed ---

async function main() {
    console.log("Iniciando o script de seed...");

    // --- 1. Criação/Verificação do Administrador ---
    const adminEmail = "admin@transportes.com";
    const adminSenha = "admin123";
    const adminNome = "Administrador";
    const clienteCpf = "09704195621";
    const clientesenha = "admin123";
    const clienteEmail = "arturlinhares2001@gmail.com"
    const clienteNome = "Artur"

    const senhaHash = await bcrypt.hash(adminSenha, 10);
    const clientehash = await bcrypt.hash(clientesenha, 10)

    const admin = await prisma.funcionario.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
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

    console.log("Funcionário administrador criado/verificado:");
    console.log(admin);

    // --- 2. Limpeza das Coletas Antigas ---
    // A ordem é importante por causa das chaves estrangeiras
    console.log('Limpando tabelas de coletas/históricos...');
    await prisma.historicoRastreio.deleteMany({});
    await prisma.solicitacaoColeta.deleteMany({});
    console.log('Tabelas limpas.');

    // --- 3. Criação de 30 Coletas Aleatórias ---
    const coletasParaCriar = 30;
    console.log(`Criando ${coletasParaCriar} coletas...`);

    for (let i = 0; i < coletasParaCriar; i++) {
        const nome = randomName();
        const nf = randomNF();
        const statusAtual = randomStatus();

        // Etapa 1: Criar a solicitação (baseado em server.js, linha 62)
        const novaSolicitacao = await prisma.solicitacaoColeta.create({
            data: {
                nomeCliente: nome,
                emailCliente: `${nome.toLowerCase().replace(/\s/g, '.')}@exemplo.com`,
                enderecoColeta: randomAddress(),
                tipoCarga: 'Caixa(s)',
                cpfCnpjRemetente: clienteCpf,
                cpfCnpjDestinatario: clienteCpf,
                numeroNotaFiscal: nf,
                valorFrete: randomFloat(50, 350, 2),
                pesoKg: randomFloat(1, 75, 1),
                dataVencimento: new Date(Date.now() + randomInt(1, 30) * 24 * 60 * 60 * 1000),
                status: statusAtual
            }
        });

        // Etapa 2: Atualizar com campos gerados (baseado em server.js, linhas 72-79)
        const numeroEncomendaGerado = `OC-${1000 + novaSolicitacao.id}`;
        const driverTokenGerado = crypto.randomBytes(16).toString('hex');

        await prisma.solicitacaoColeta.update({
            where: { id: novaSolicitacao.id },
            data: {
                numeroEncomenda: numeroEncomendaGerado,
                driverToken: driverTokenGerado
            }
        });

        // Etapa 3: Criar histórico de rastreio (baseado em server.js, linha 264 e 468)

        // Histórico de "Solicitado" (para todos)
        await prisma.historicoRastreio.create({
            data: {
                status: StatusColeta.PENDENTE,
                localizacao: 'Solicitação recebida pela transportadora',
                solicitacao: {
                    connect: { numeroEncomenda: numeroEncomendaGerado }
                }
            }
        });

        // Histórico do status atual (se não for pendente)
        if (statusAtual !== StatusColeta.PENDENTE) {
            let localizacao = 'Centro de Distribuição - Ouro Branco, MG';
            if (statusAtual === StatusColeta.CONCLUIDA) {
                localizacao = 'Entrega realizada';
            } else if (statusAtual === StatusColeta.EM_ROTA_ENTREGA) {
                localizacao = 'Em rota de entrega final';
            }

            await prisma.historicoRastreio.create({
                data: {
                    status: statusAtual,
                    localizacao: localizacao,
                    solicitacao: {
                        connect: { numeroEncomenda: numeroEncomendaGerado }
                    }
                }
            });
        }
    }

    console.log(`${coletasParaCriar} coletas criadas.`);
    console.log("Seed concluído com sucesso!");
}

// --- Execução ---

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        // Fecha a conexão com o banco
        await prisma.$disconnect();
    });