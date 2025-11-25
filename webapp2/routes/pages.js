const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

/**
 * GET /
 * Page d'accueil
 */
router.get('/', (req, res) => {
    res.render('pages/home', {
        title: 'Accueil - Projet CIS'
    });
});

/**
 * GET /profile
 * Page de profil utilisateur (protégée)
 */
router.get('/profile', requireAuth, (req, res) => {
    const userinfo = req.session.userinfo;
    const tokenSet = req.session.tokenSet;

    // Calcul du temps restant avant expiration
    const expiresIn = tokenSet.expires_at - Math.floor(Date.now() / 1000);
    const isExpired = expiresIn <= 0;

    res.render('pages/profile', {
        title: 'Mon Profil',
        userinfo,
        tokenSet,
        expiresIn,
        isExpired
    });
});

/**
 * GET /devices
 * Page de gestion des appareils (protégée)
 */
router.get('/devices', requireAuth, (req, res) => {
    res.render('pages/devices', {
        title: 'Mes Appareils'
    });
});

module.exports = router;