/**
 * Middleware pour vérifier si l'utilisateur est authentifié
 */
function requireAuth(req, res, next) {
    if (!req.session.tokenSet) {
        return res.redirect('/login');
    }
    next();
}

/**
 * Middleware pour vérifier si le token est expiré
 */
function checkTokenExpiration(req, res, next) {
    if (req.session.tokenSet) {
        const expiresAt = req.session.tokenSet.expires_at;
        const now = Math.floor(Date.now() / 1000);

        if (expiresAt && now >= expiresAt) {
            // Token expiré, on pourrait implémenter le refresh token ici
            console.log('⚠️ Token expiré, déconnexion de l\'utilisateur');
            req.session.destroy();
            return res.redirect('/login');
        }
    }
    next();
}

/**
 * Middleware pour rediriger les utilisateurs authentifiés
 */
function redirectIfAuthenticated(req, res, next) {
    if (req.session.tokenSet) {
        return res.redirect('/profile');
    }
    next();
}

module.exports = {
    requireAuth,
    checkTokenExpiration,
    redirectIfAuthenticated
};