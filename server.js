require('dotenv').config();

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
const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = 3001;


const allowedOrigins = [
    process.env.FRONTEND_URL_DEV,
    process.env.FRONTEND_URL_PROD
];

app.use(cors({
    origin: function (origin, callback) {
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

        const novaSolicitacao = await prisma.solicitacaoColeta.create({
            data: {
                nomeCliente, emailCliente, enderecoColeta, tipoCarga,
                cpfCnpjRemetente, cpfCnpjDestinatario, numeroNotaFiscal,
                valorFrete: parseFloat(valorFrete),
                pesoKg: pesoKg ? parseFloat(pesoKg) : null,
                dataVencimento: dataVencimento ? new Date(dataVencimento) : null
            }
        });

        const numeroEncomendaGerado = `OC-${1000 + novaSolicitacao.id}`;
        const driverTokenGerado = crypto.randomBytes(16).toString('hex');

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

app.post('/api/rastreamento/destinatario', async (req, res) => {
    try {
        const { numeroEncomenda, cpfCnpj } = req.body;

        const cliente = await prisma.cliente.findUnique({ where: { cpfCnpj: cpfCnpj } });
        if (!cliente) {
            return res.status(404).json({ error: "Cliente (CPF/CNPJ) não encontrado." });
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

app.put('/api/admin/coletas/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const novosDadosColeta = req.body;
    const coletaId = parseInt(id);
    if (novosDadosColeta.dataVencimento) {
        novosDadosColeta.dataVencimento = new Date(novosDadosColeta.dataVencimento);
    } else if (novosDadosColeta.dataVencimento === '') {
        novosDadosColeta.dataVencimento = null;
    }


    try {
        const coletaAtualizada = await prisma.solicitacaoColeta.update({
            where: {
                id: coletaId,
            },
            data: {
                ...novosDadosColeta,
            },
        });

        return res.status(200).json(coletaAtualizada);

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao atualizar coleta:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coleta não encontrada para atualização.' });
        }

        return res.status(500).json({ error: 'Erro interno ao atualizar a coleta.' });
    }
});
app.delete('/api/admin/coletas/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const coletaId = parseInt(id);

    try {
        await prisma.historicoRastreio.deleteMany({
            where: {
                solicitacaoId: coletaId,
            },
        });

        const coletaExcluida = await prisma.solicitacaoColeta.delete({
            where: {
                id: coletaId,
            },
        });

        return res.status(200).json({
            message: `Coleta #${coletaExcluida.numeroEncomenda} excluída com sucesso.`,
            id: coletaExcluida.id
        });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao excluir coleta:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coleta não encontrada.' });
        }

        return res.status(500).json({ error: 'Erro interno ao excluir a coleta.' });
    }
});

app.get('/api/rastreamento/publico/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const coleta = await prisma.solicitacaoColeta.findFirst({
            where: {
                OR: [
                    { numeroEncomenda: id },
                    { numeroNotaFiscal: id }
                ]
            },
            include: {
                historico: {
                    orderBy: { data: 'desc' }
                }
            }
        });

        if (!coleta) {
            return res.status(404).json({ error: 'Coleta não encontrada. Verifique o número.' });
        }

        return res.status(200).json({
            numeroEncomenda: coleta.numeroEncomenda,
            status: coleta.status,
            historico: coleta.historico.map(h => ({
                data: h.data,
                status: h.status,
                localizacao: h.localizacao
            }))
        });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha no rastreamento público:', error);
        return res.status(500).json({ error: 'Erro interno ao realizar o rastreamento.' });
    }
});

app.post('/api/devolucao/solicitar', async (req, res) => {
    const {
        numeroNFOriginal,
        nomeCliente,
        emailCliente,
        motivoDevolucao
    } = req.body;

    if (!numeroNFOriginal || !nomeCliente || !emailCliente) {
        return res.status(400).json({ error: 'Campos obrigatórios (NF, nome, e-mail) faltando.' });
    }

    try {
        const coletaOriginal = await prisma.solicitacaoColeta.findUnique({
            where: { numeroNotaFiscal: numeroNFOriginal },
            select: {
                id: true,
                status: true,
                numeroEncomenda: true
            }
        });

        if (!coletaOriginal) {
            return res.status(404).json({ error: 'Nota Fiscal não encontrada ou não vinculada a uma coleta.' });
        }

        if (coletaOriginal.status !== 'CONCLUIDA' && coletaOriginal.status !== 'EM_DEVOLUCAO') {
            return res.status(400).json({
                error: `A coleta deve estar CONCLUIDA para solicitar devolução. Status atual: ${coletaOriginal.status}`
            });
        }

        const [solicitacaoDevolucao, atualizacaoColeta] = await prisma.$transaction([
            prisma.solicitacaoDevolucao.create({
                data: {
                    nomeCliente,
                    emailCliente,
                    numeroNFOriginal,
                    motivoDevolucao,
                }
            }),
            prisma.solicitacaoColeta.update({
                where: { id: coletaOriginal.id },
                data: {
                    status: 'EM_DEVOLUCAO',
                    historico: {
                        create: {
                            status: 'EM_DEVOLUCAO',
                            localizacao: `Devolução solicitada pelo cliente. NF: ${numeroNFOriginal}`,
                        }
                    }
                },
                select: { numeroEncomenda: true, status: true }
            })
        ]);
        return res.status(200).json({
            message: 'Solicitação de devolução registrada com sucesso. O status da coleta foi atualizado.',
            coleta: atualizacaoColeta,
            solicitacaoId: solicitacaoDevolucao.id
        });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao solicitar devolução:', error);
        return res.status(500).json({ error: 'Erro interno ao processar a solicitação de devolução.' });
    }
});

app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const coletasMes = await prisma.solicitacaoColeta.count({
            where: {
                dataSolicitacao: {
                    gte: firstDayOfMonth,
                },
            },
        });
        const contagemStatus = await prisma.solicitacaoColeta.groupBy({
            by: ['status'],
            _count: {
                id: true,
            },
        });

        const totalPorStatus = {
            PENDENTE: 0,
            COLETADO: 0,
            EM_TRANSITO: 0,
            EM_ROTA_ENTREGA: 0,
            CONCLUIDA: 0,
            CANCELADA: 0,
            EM_DEVOLUCAO: 0,
        };

        contagemStatus.forEach(item => {
            if (item.status in totalPorStatus) {
                totalPorStatus[item.status] = item._count.id;
            }
        });

        const faturamentoAgregado = await prisma.solicitacaoColeta.aggregate({
            _sum: {
                valorFrete: true,
            },
            where: {
                status: 'CONCLUIDA',
            },
        });

        const faturamentoTotal = faturamentoAgregado._sum.valorFrete || 0;

        return res.status(200).json({
            statusCounts: totalPorStatus,
            faturamentoTotal: faturamentoTotal,
            coletasMes
        });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao obter estatísticas:', error);
        return res.status(500).json({ error: 'Erro interno ao processar as estatísticas.' });
    }
});

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

app.post('/api/cliente/cadastro', async (req, res) => {
    const { cpfCnpj, senha, nome, email } = req.body;
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!cpfCnpj || !senha) {
        return res.status(400).json({ error: 'CPF/CNPJ e senha são obrigatórios.' });
    }

    try {
        const clienteExistente = await prisma.cliente.findUnique({
            where: { cpfCnpj: cpfCnpj }
        });

        if (clienteExistente) {
            return res.status(409).json({ error: 'CPF/CNPJ já cadastrado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        const novoCliente = await prisma.cliente.create({
            data: {
                cpfCnpj: cpfCnpj,
                senha: senhaHash,
                nome: nome,
                email: email
            }
        });

        const { senha: _, ...clienteInfo } = novoCliente;

        return res.status(201).json({
            message: 'Cadastro realizado com sucesso. Por favor, faça login.',
            cliente: clienteInfo
        });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha no cadastro do cliente:', error);
        return res.status(500).json({ error: 'Erro interno ao cadastrar cliente.' });
    }
});
app.post('/api/cliente/login', async (req, res) => {
    const { cpfCnpj, senha } = req.body;
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!cpfCnpj || !senha) {
        return res.status(400).json({ error: 'CPF/CNPJ e senha são obrigatórios.' });
    }

    try {
        const cliente = await prisma.cliente.findUnique({
            where: { cpfCnpj: cpfCnpj }
        });

        if (!cliente || !cliente.senha) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const isMatch = await bcrypt.compare(senha, cliente.senha);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
            { id: cliente.id, cpfCnpj: cliente.cpfCnpj, role: 'cliente' },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        return res.status(200).json({ token: token });

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha no login do cliente:', error);
        return res.status(500).json({ error: 'Erro interno no login.' });
    }
});
app.get('/api/cliente/minhas-coletas', authMiddleware, async (req, res) => {
    if (req.user.role !== 'cliente') {
        return res.status(403).json({ error: "Acesso negado. Apenas clientes podem visualizar suas coletas." });
    }
    try {
        const clienteCpfCnpj = req.user.cpfCnpj;

        const coletas = await prisma.solicitacaoColeta.findMany({
            where: {
                OR: [
                    { cpfCnpjRemetente: clienteCpfCnpj },
                    { cpfCnpjDestinatario: clienteCpfCnpj }
                ]
            },
            include: {
                historico: {
                    orderBy: { data: 'desc' },
                }
            }
        });

        const coletasComDevolucao = await Promise.all(coletas.map(async (coleta) => {
            const devolucao = await prisma.solicitacaoDevolucao.findFirst({
                where: { numeroNFOriginal: coleta.numeroNotaFiscal },
            });
            return {
                ...coleta,
                statusDevolucaoProcessamento: devolucao?.statusProcessamento || null,
                motivoRejeicaoDevolucao: devolucao?.motivoRejeicao || null,
            };
        }));
        
        return res.status(200).json(coletasComDevolucao);

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao buscar coletas do cliente:', error);
        return res.status(500).json({ error: 'Erro interno ao buscar dados.' });
    }
});

app.put('/api/admin/devolucoes/:nf/rejeitar', authMiddleware, async (req, res) => {
    const { nf } = req.params;
    const { motivoRejeicao } = req.body;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
    }
    if (!motivoRejeicao || motivoRejeicao.trim() === '') {
        return res.status(400).json({ error: "O motivo da rejeição é obrigatório." });
    }

    try {
        const devolucaoAtualizada = await prisma.solicitacaoDevolucao.update({
            where: { numeroNFOriginal: nf }, 
            data: { 
                statusProcessamento: 'REJEITADA', 
                motivoRejeicao: motivoRejeicao 
            }
        });

        return res.status(200).json(devolucaoAtualizada);

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao rejeitar devolução:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Solicitação de devolução não encontrada.' });
        }
        return res.status(500).json({ error: 'Erro interno ao rejeitar devolução.' });
    }
});

// --- ROTA PROTEGIDA: APROVAR (ACEITAR) DEVOLUÇÃO (Adicionada) ---
app.put('/api/admin/devolucoes/:nf/aprovar', authMiddleware, async (req, res) => {
    const { nf } = req.params;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
    }

    try {
        const devolucaoAtualizada = await prisma.solicitacaoDevolucao.update({
            where: { numeroNFOriginal: nf },
            data: { 
                statusProcessamento: 'APROVADA', 
                motivoRejeicao: null // Limpa o motivo se estava em REJEITADA
            }
        });
        
        // Opcional: Atualizar a coleta para EM_DEVOLUCAO, garantindo a consistência logística
        await prisma.solicitacaoColeta.update({
             where: { numeroNotaFiscal: nf },
             data: { status: 'EM_DEVOLUCAO' }
        });

        return res.status(200).json(devolucaoAtualizada);

    } catch (error) {
        console.error('ERRO NO BACKEND: Falha ao aprovar devolução:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Solicitação de devolução não encontrada.' });
        }
        return res.status(500).json({ error: 'Erro interno ao aprovar devolução.' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend esta rodando em http://localhost:${PORT}`);
});