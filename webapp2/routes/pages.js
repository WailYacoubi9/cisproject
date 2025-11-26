const express = require('express');
const { requireAuth, refreshTokenIfNeeded } = require('../middleware/auth');
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
 * Le refresh token sera automatiquement vérifié et renouvelé si nécessaire
 */
router.get('/profile', refreshTokenIfNeeded, requireAuth, (req, res) => {
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
 * Page de gestion des appareils avec intégration Device App
 */
router.get('/devices', refreshTokenIfNeeded, requireAuth, async (req, res) => {
    // Vérifier le statut de device-app
    let deviceStatus = null;
    try {
        const axios = require('axios');
        const https = require('https');
        
        // Ignorer les certificats auto-signés en dev
        const agent = new https.Agent({  
            rejectUnauthorized: false
        });
        
        const response = await axios.get('https://localhost:4000/api/status', { 
            httpsAgent: agent 
        });
        deviceStatus = response.data;
    } catch (error) {
        console.log('Device-app non accessible:', error.message);
    }

    res.render('pages/devices', {
        title: 'Mes Appareils',
        deviceStatus
    });
});

module.exports = router;