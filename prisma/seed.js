const { PrismaClient, StatusColeta } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();


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
    const S = statuses[randomInt(0, statuses.length - 1)];
    const chance = Math.random();
    if (chance < 0.4) return StatusColeta.PENDENTE;
    if (chance < 0.7) return StatusColeta.EM_TRANSITO;
    return S;
}


async function main() {
    console.log("Iniciando o script de seed...");

    const adminEmail = "admin@transportes.com";
    const adminSenha = "admin123"; 
    const adminNome = "Administrador";

    const senhaHash = await bcrypt.hash(adminSenha, 10);
    console.log("Senha do admin criptografada.");

    const admin = await prisma.funcionario.upsert({
        where: { email: adminEmail }, 
        update: {}, 
        create: { 
            email: adminEmail,
            senha: senhaHash,
            nome: adminNome
        }
    });

    console.log("Funcionário administrador criado/verificado:");
    console.log(admin);

    console.log('Limpando tabelas de coletas/históricos...');
    await prisma.historicoRastreio.deleteMany({});
    await prisma.solicitacaoColeta.deleteMany({});
    console.log('Tabelas limpas.');

    const coletasParaCriar = 30;
    console.log(`Criando ${coletasParaCriar} coletas...`);

    for (let i = 0; i < coletasParaCriar; i++) {
        const nome = randomName();
        const nf = randomNF();
        const statusAtual = randomStatus();

        const novaSolicitacao = await prisma.solicitacaoColeta.create({
            data: {
                nomeCliente: nome,
                emailCliente: `${nome.toLowerCase().replace(/\s/g, '.')}@exemplo.com`,
                enderecoColeta: randomAddress(),
                tipoCarga: 'Caixa(s)',
                cpfCnpjRemetente: randomCPF(),
                cpfCnpjDestinatario: randomCPF(),
                numeroNotaFiscal: nf,
                valorFrete: randomFloat(50, 350, 2),
                pesoKg: randomFloat(1, 75, 1),
                dataVencimento: new Date(Date.now() + randomInt(1, 30) * 24 * 60 * 60 * 1000),
                status: statusAtual
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

        
        await prisma.historicoRastreio.create({
            data: {
                status: StatusColeta.PENDENTE,
                localizacao: 'Solicitação recebida pela transportadora',
                solicitacao: {
                    connect: { numeroEncomenda: numeroEncomendaGerado }
                }
            }
        });

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


main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });