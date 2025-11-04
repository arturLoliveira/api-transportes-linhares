const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando o script de seed...");

    // 1. Defina os dados do seu primeiro funcionário
    const adminEmail = "admin@transportes.com";
    const adminSenha = "admin123"; // Defina uma senha forte depois
    const adminNome = "Administrador";

    // 2. Criptografe a senha
    const senhaHash = await bcrypt.hash(adminSenha, 10);
    console.log("Senha criptografada.");

    // 3. Crie o funcionário (usando 'upsert')
    // 'upsert' tenta ATUALIZAR. Se não encontrar, ele CRIA.
    // Isso é ótimo porque você pode rodar o seed várias vezes sem criar duplicatas.
    const admin = await prisma.funcionario.upsert({
        where: { email: adminEmail }, // Como encontrar o usuário
        update: {}, // O que atualizar (nada, no caso)
        create: { // O que criar se não for encontrado
            email: adminEmail,
            senha: senhaHash,
            nome: adminNome
        }
    });

    console.log("Funcionário administrador criado/verificado:");
    console.log(admin);
    console.log("Seed concluído com sucesso!");
}

// Executa a função main
main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });