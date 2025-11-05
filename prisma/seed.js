const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando o script de seed...");

    const adminEmail = "admin@transportes.com";
    const adminSenha = "admin123"; 
    const adminNome = "Administrador";

    const senhaHash = await bcrypt.hash(adminSenha, 10);
    console.log("Senha criptografada.");

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