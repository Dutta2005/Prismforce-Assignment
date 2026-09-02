const ALLOWED_ROLES = new Set(['admin', 'employee']);

export function getRole(req) {
    const role = String(req.header('x-user-role'));
    return ALLOWED_ROLES.has(role) ? role : 'employee';
}

export function requireRole(role) {
    return (req, res, next) => {
        if (getRole(req) !== role) {
            return res.status(403).json({ error: `${role} role required` })
        }
        next();
    };
}