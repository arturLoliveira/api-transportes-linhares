const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Nenhum token fornecido." });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
        return res.status(401).json({ error: "Erro no formato do token." });
    }

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: "Token mal formatado." });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: "Token inválido ou expirado." });
        }
        
    
        if (decoded.role !== 'admin' && decoded.role !== 'cliente') {
             return res.status(403).json({ error: "Permissão negada. Role inválida ou ausente no token." });
        }

        req.user = decoded; 
        
        req.userId = decoded.id; 
        

        return next();
    });
}

module.exports = authMiddleware;