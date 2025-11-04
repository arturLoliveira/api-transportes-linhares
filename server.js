require('dotenv').config();
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.co')) {
    const url = new URL(process.env.DATABASE_URL);

    const hostSemPorta = url.hostname;

    process.env.DATABASE_URL = `postgresql://${url.username}:${url.password}@${hostSemPorta}:5432${url.pathname}?sslmode=require&pgbouncer=disable`;
}
const express = require('express');
const cors = require('cors');
const { PrismaClient, StatusColeta } = require('@prisma/client');
const { Resend } = require('resend'); 
const PDFDocument = require('pdfkit'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./authMiddleware');
const crypto = require('crypto'); 

const app = express();
const prisma = new PrismaClient();
const resend = new Resend('process.env.RESEND_API_KEY'); 
const JWT_SECRET = process.env.JWT_SECRET; 
const PORT = 3001;


const allowedOrigins = [
  process.env.FRONTEND_URL_DEV,  
  process.env.FRONTEND_URL_PROD 
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());



app.post('/api/coletas/solicitar', async (req, res) => {
  try {
    console.log("BACKEND: Nova solicitação recebida:", req.body);
    const { 
        nomeCliente, emailCliente, enderecoColeta, tipoCarga, 
        cpfCnpjRemetente, cpfCnpjDestinatario, numeroNotaFiscal,
        valorFrete, pesoKg, dataVencimento 
    } = req.body;

    if (!valorFrete || parseFloat(valorFrete) <= 0) {
        return res.status(400).json({ error: "O 'valorFrete' é obrigatório e deve ser maior do que zero." });
    }

    // 1. Salva a coleta primeiro para obter o ID
    const novaSolicitacao = await prisma.solicitacaoColeta.create({
      data: {
        nomeCliente, emailCliente, enderecoColeta, tipoCarga,
        cpfCnpjRemetente, cpfCnpjDestinatario, numeroNotaFiscal,
        valorFrete: parseFloat(valorFrete),
        pesoKg: pesoKg ? parseFloat(pesoKg) : null,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : null
      }
    });

    // 2. Gera os campos secundários
    const numeroEncomendaGerado = `OC-${1000 + novaSolicitacao.id}`;
    const driverTokenGerado = crypto.randomBytes(16).toString('hex');

    // 3. Atualiza a coleta com os novos campos
    const coletaAtualizada = await prisma.solicitacaoColeta.update({
        where: { id: novaSolicitacao.id },
        data: {
            numeroEncomenda: numeroEncomendaGerado,
            driverToken: driverTokenGerado 
        }
    });

    console.log(`BACKEND: Coleta ${novaSolicitacao.id} salva. Nº Encomenda: ${numeroEncomendaGerado}`);
    res.status(201).json(coletaAtualizada);

  } catch (error) {
    console.error("BACKEND: Erro ao salvar coleta:", error);
    res.status(500).json({ error: "Ocorreu um erro ao processar a solicitação." });
  }
});


// 2. RASTREAMENTO (REMETENTE) (Atualizado para Nº Encomenda)
app.post('/api/rastreamento/remetente', async (req, res) => {
  try {
    const { numeroEncomenda, cpfCnpj } = req.body;
    
    const coleta = await prisma.solicitacaoColeta.findUnique({
      where: { numeroEncomenda: numeroEncomenda },
      include: { historico: { orderBy: { data: 'desc' } } }
    });

    if (!coleta) {
        return res.status(404).json({ error: "Número da encomenda não encontrado." });
    }
    
    if (coleta.cpfCnpjRemetente !== cpfCnpj) {
        return res.status(401).json({ error: "O CPF/CNPJ do remetente não corresponde a esta encomenda." });
    }

    res.status(200).json(coleta);
    
  } catch (error) { 
    console.error("Erro Rastreio Remetente:", error);
    res.status(500).json({ error: "Erro no servidor." }); 
  }
});

// 3. RASTREAMENTO (DESTINATÁRIO) (Atualizado com Senha e Nº Encomenda)
app.post('/api/rastreamento/destinatario', async (req, res) => {
    try {
        const { numeroEncomenda, cpfCnpj, senha } = req.body;

        const cliente = await prisma.cliente.findUnique({ where: { cpfCnpj: cpfCnpj } });
        if (!cliente) {
            return res.status(404).json({ error: "Cliente (CPF/CNPJ) não encontrado." });
        }

        const senhaCorreta = await bcrypt.compare(senha, cliente.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ error: "Senha de acesso inválida." });
        }

        const coleta = await prisma.solicitacaoColeta.findUnique({
            where: { numeroEncomenda: numeroEncomenda },
            include: { historico: { orderBy: { data: 'desc' } } }
        });

        if (!coleta) {
             return res.status(404).json({ error: "Número da encomenda não encontrado." });
        }
        
        if (coleta.cpfCnpjDestinatario !== cpfCnpj) {
            return res.status(401).json({ error: "O CPF/CNPJ do destinatário não corresponde a esta encomenda." });
        }
        
        res.status(200).json(coleta);

    } catch (error) { 
        console.error("ERRO DETALHADO NO RASTREIO:", error);
        res.status(500).json({ error: "Erro no servidor." }); 
    }
});

// 4. SOLICITAR DEVOLUÇÃO
app.post('/api/devolucoes/solicitar', async (req, res) => {
    try {
        const { nomeCliente, emailCliente, numeroNFOriginal, motivoDevolucao } = req.body;
        const novaDevolucao = await prisma.solicitacaoDevolucao.create({
            data: { nomeCliente, emailCliente, numeroNFOriginal, motivoDevolucao }
        });
        await resend.emails.send({
            from: 'onboarding@resend.dev', // Mude para seu email verificado
            to: emailCliente,
            subject: 'Confirmação de Solicitação de Devolução',
            html: `<p>Olá ${nomeCliente},</p><p>Recebemos sua solicitação para devolver a NF ${numeroNFOriginal}.</p><p>O prazo de coleta é de até 3 dias.</p>`
        });
        res.status(201).json(novaDevolucao);
    } catch (error) {
        console.error("Erro na devolução:", error);
        res.status(500).json({ error: "Erro ao processar devolução." });
    }
});

// 5. EMISSÃO DE FATURA (PDF de Exemplo)
app.get('/api/fatura/:nf', async (req, res) => {
    try {
        const { nf } = req.params;
        const coleta = await prisma.solicitacaoColeta.findUnique({ 
            where: { numeroNotaFiscal: nf } 
        });
        if (!coleta) { return res.status(404).json({ error: "Nota Fiscal não encontrada." }); }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=fatura_${nf}.pdf`);
        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res); 
        doc.fontSize(20).text('Transportes Linhares', { align: 'center' });
        doc.fontSize(10).text('Rua Santo Antônio, 1372, Centro, Ouro Branco', { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(18).text(`FATURA (Demonstração)`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12)
           .text(`Nota Fiscal: ${coleta.numeroNotaFiscal}`, { continued: true })
           .text(`Data Emissão: ${new Date(coleta.dataSolicitacao).toLocaleDateString('pt-BR')}`, { align: 'right' });
        doc.text(`Cliente: ${coleta.nomeCliente}`);
        doc.text(`Remetente (CPF/CNPJ): ${coleta.cpfCnpjRemetente}`);
        doc.text(`Destinatário (CPF/CNPJ): ${coleta.cpfCnpjDestinatario}`);
        doc.moveDown();
        doc.text(`Serviço: Transporte de carga (${coleta.pesoKg || 'N/A'} Kg)`);
        doc.text(`Endereço de Coleta: ${coleta.enderecoColeta}`);
        doc.moveDown();
        doc.fontSize(16).text(`Valor Total: R$ ${coleta.valorFrete.toFixed(2)}`, { align: 'right' });
        const vencimento = coleta.dataVencimento 
            ? new Date(coleta.dataVencimento).toLocaleDateString('pt-BR') 
            : 'A combinar';
        doc.fontSize(12).text(`Data de Vencimento: ${vencimento}`, { align: 'right' });
        doc.moveDown(2);
        doc.fontSize(10).text('Este documento não é um boleto bancário.', { align: 'center' });
        doc.end();
    } catch (error) {
        console.error("Erro ao gerar fatura:", error);
        res.status(500).json({ error: "Erro ao gerar fatura." });
    }
});

// 6. IMPRIMIR ETIQUETA (PDF de Exemplo)
app.get('/api/etiqueta/:nf', async (req, res) => {
    try {
        const { nf } = req.params;
        const coleta = await prisma.solicitacaoColeta.findUnique({ where: { numeroNotaFiscal: nf } });
        if (!coleta) { return res.status(404).json({ error: "Nota Fiscal não encontrada." }); }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=etiqueta_${nf}.pdf`);
        const doc = new PDFDocument({ size: [288, 432] });
        doc.pipe(res);
        doc.fontSize(14).text('ETIQUETA DE VOLUME', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`REMETENTE: ${coleta.nomeCliente}`);
        doc.text(`ENDEREÇO: ${coleta.enderecoColeta}`);
        doc.moveDown();
        doc.fontSize(12).text(`DESTINATÁRIO (CPF/CNPJ):`, { underline: true });
        doc.fontSize(10).text(coleta.cpfCnpjDestinatario);
        doc.moveDown();
        doc.text(`NF: ${coleta.numeroNotaFiscal}`);
        doc.end();
    } catch (error) {
        res.status(500).json({ error: "Erro ao gerar etiqueta." });
    }
});


// --- ROTA PÚBLICA (MOTORISTA) ---

// 7. MOTORISTA: Atualizar Status via QR Code
app.post('/api/driver/update', async (req, res) => {
    const { numeroEncomenda, token, status, localizacao } = req.body;

    if (!numeroEncomenda || !token || !status || !localizacao) {
        return res.status(400).json({ error: "Dados insuficientes." });
    }
    if (!Object.values(StatusColeta).includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
    }

    try {
        const coleta = await prisma.solicitacaoColeta.findUnique({
            where: { numeroEncomenda: numeroEncomenda }
        });
        if (!coleta) {
            return res.status(404).json({ error: "Encomenda não encontrada." });
        }
        if (coleta.driverToken !== token) {
            return res.status(401).json({ error: "Token de autorização inválido." });
        }
        
        await prisma.$transaction([
            prisma.solicitacaoColeta.update({
                where: { numeroEncomenda: numeroEncomenda },
                data: { status: status }
            }),
            prisma.historicoRastreio.create({
                data: {
                    status: status,
                    localizacao: localizacao,
                    solicitacao: { connect: { numeroEncomenda: numeroEncomenda } }
                }
            })
        ]);
        
        res.status(200).json({ message: "Status atualizado com sucesso!" });
    
    } catch (error) {
        console.error("Erro na atualização do motorista:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});


// --- ROTAS DE ADMIN (Autenticadas) ---

// 8. ADMIN: Registrar Funcionário (Para testes)
app.post('/api/admin/registrar', async (req, res) => {
    const { email, senha, nome } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10); 
    const novoFuncionario = await prisma.funcionario.create({
        data: { email, senha: senhaHash, nome }
    });
    res.status(201).json(novoFuncionario);
});

// 9. ADMIN: Login Funcionário (COM CHECKPOINTS)
app.post('/api/admin/login', async (req, res) => {
    console.log("BACKEND: Rota /api/admin/login ALCANÇADA."); // Ponto de Partida
    const { email, senha } = req.body;

    try {
        console.log("BACKEND: Checkpoint 1 - A procurar o funcionário no banco...");
        const funcionario = await prisma.funcionario.findUnique({ where: { email } });
        console.log("BACKEND: Checkpoint 2 - Terminou de procurar o funcionário.");

        if (!funcionario) {
            console.log("BACKEND: ERRO - Usuário não encontrado.");
            return res.status(404).json({ error: "Usuário não encontrado." });
        }

        console.log("BACKEND: Checkpoint 3 - A comparar a senha...");
        const senhaCorreta = await bcrypt.compare(senha, funcionario.senha);
        console.log("BACKEND: Checkpoint 4 - Terminou de comparar a senha.");

        if (!senhaCorreta) {
            console.log("BACKEND: ERRO - Senha inválida.");
            return res.status(401).json({ error: "Senha inválida." });
        }

        console.log("BACKEND: Checkpoint 5 - A gerar o token...");
        const token = jwt.sign({ id: funcionario.id, email: funcionario.email }, JWT_SECRET, {
            expiresIn: '8h'
        });

        console.log("BACKEND: Checkpoint 6 - A enviar resposta de sucesso.");
        res.status(200).json({ message: "Login com sucesso!", token: token });

    } catch (error) {
        console.error("BACKEND: Ocorreu um erro INESPERADO no login:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

// 10. ADMIN: Registrar Cliente
app.post('/api/admin/clientes/registrar', authMiddleware, async (req, res) => {
    const { cpfCnpj, senha, nome, email } = req.body;
    
    if (!cpfCnpj || !senha) {
        return res.status(400).json({ error: "CPF/CNPJ e senha são obrigatórios." });
    }
    const senhaHash = await bcrypt.hash(senha, 10); 

    try {
        const novoCliente = await prisma.cliente.create({
            data: { cpfCnpj, senha: senhaHash, nome, email }
        });
        res.status(201).json(novoCliente);
    } catch (e) {
        if (e.code === 'P2002') { 
            return res.status(409).json({ error: "Este CPF/CNPJ já está cadastrado." });
        }
        console.error("Erro ao cadastrar cliente:", e);
        res.status(500).json({ error: "Erro ao cadastrar cliente." });
    }
});

// 11. ADMIN: Ver Devoluções
app.get('/api/admin/devolucoes', authMiddleware, async (req, res) => {
    try {
        const devolucoes = await prisma.solicitacaoDevolucao.findMany({
            orderBy: { dataSolicitacao: 'desc' }
        });
        res.status(200).json(devolucoes);
    } catch (error) {
        console.error("Erro ao buscar devoluções:", error);
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});

// 12. ADMIN: Ver Coletas (com filtro)
app.get('/api/admin/coletas', authMiddleware, async (req, res) => {
    const { status } = req.query; 
    let whereClause = {}; 
    
    if (status && Object.values(StatusColeta).includes(status)) {
        whereClause.status = status;
    }
    try {
        const coletas = await prisma.solicitacaoColeta.findMany({
            where: whereClause,
            orderBy: { dataSolicitacao: 'desc' }
        });
        res.status(200).json(coletas);
    } catch (error) {
        console.error("Erro ao buscar coletas:", error);
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});

// 13. ADMIN: Ver Estatísticas
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const coletasHoje = await prisma.solicitacaoColeta.count({
            where: { dataSolicitacao: { gte: today, lt: tomorrow } }
        });
        const devolucoesPendentes = await prisma.solicitacaoDevolucao.count(); 
        const coletasEntregues = await prisma.solicitacaoColeta.count({
            where: { status: 'CONCLUIDA' }
        });
        
        res.status(200).json({
            coletasHoje: coletasHoje,
            devolucoesPendentes: devolucoesPendentes,
            coletasEntregues: coletasEntregues
        });
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});

// 14. ADMIN: Adicionar Evento de Histórico (a rota correta de update)
app.post('/api/admin/coletas/:nf/historico', authMiddleware, async (req, res) => {
    const { nf } = req.params;
    const { status, localizacao } = req.body;

    if (!status || !localizacao) {
        return res.status(400).json({ error: "Status e Localização são obrigatórios." });
    }
    if (!Object.values(StatusColeta).includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
    }

    try {
        const [coletaAtualizada] = await prisma.$transaction([
            prisma.solicitacaoColeta.update({
                where: { numeroNotaFiscal: nf },
                data: { status: status }
            }),
            prisma.historicoRastreio.create({
                data: {
                    status: status,
                    localizacao: localizacao,
                    solicitacao: { connect: { numeroNotaFiscal: nf } }
                }
            })
        ]);
        res.status(201).json(coletaAtualizada);
    } catch (error) {
        console.error("Erro ao adicionar histórico:", error);
        if (error.code === 'P2025') { 
            return res.status(404).json({ error: "Nota Fiscal não encontrada." });
        }
        res.status(500).json({ error: "Erro ao atualizar rastreio." });
    }
});

// --- Iniciar o Servidor ---
app.listen(PORT, () => {
  console.log(`Backend esta rodando em http://localhost:${PORT}`);
});