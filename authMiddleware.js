const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
    // Pega o token do cabeçalho 'Authorization'
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Nenhum token fornecido." });
    }

    // O token vem no formato "Bearer TOKEN_AQUI"
    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
        return res.status(401).json({ error: "Erro no formato do token." });
    }

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: "Token mal formatado." });
    }

    // Verifica se o token é válido
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: "Token inválido ou expirado." });
        }

        // Se for válido, anexa o ID do usuário na requisição e continua
        req.userId = decoded.id;
        return next();
    });
}

module.exports = authMiddleware;