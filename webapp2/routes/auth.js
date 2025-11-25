const express = require('express');
const { generators } = require('openid-client');
const router = express.Router();

/**
 * GET /login
 * Initie le flux d'authentification OpenID Connect
 */
router.get('/login', (req, res) => {
    const keycloakClient = req.app.locals.keycloakClient;

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    // Sauvegarde des valeurs PKCE pour la vérification
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;

    const authUrl = keycloakClient.authorizationUrl({
        scope: 'openid profile email',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });

    console.log('Redirection vers Keycloak pour authentification');
    res.redirect(authUrl);
});

/**
 * GET /register
 * Initie le flux d'inscription
 */
router.get('/register', (req, res) => {
    const keycloakClient = req.app.locals.keycloakClient;

    // 1. PKCE : Génère un code_verifier aléatoire
    const codeVerifier = generators.codeVerifier()
        ;
    // 2. PKCE : Crée le code_challenge (SHA256 du verifier)
    const codeChallenge = generators.codeChallenge(codeVerifier);

    // 3. CSRF : Génère un state aléatoire
    const state = generators.state();

    // Sauvegarde des valeurs PKCE et state en session pour la vérification ultérieure
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;

    const registerUrl = keycloakClient.authorizationUrl({
        scope: 'openid profile email',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        kc_action: 'REGISTER'
    });

    console.log('Redirection vers la page d\'inscription Keycloak');
    res.redirect(registerUrl);
});

/**
 * GET /auth/callback
 * Callback OAuth2 - Réception du code d'autorisation
 */
router.get('/auth/callback', async (req, res) => {
    const keycloakClient = req.app.locals.keycloakClient;

    try {
        const params = keycloakClient.callbackParams(req);

        // Vérification du state (protection CSRF)
        if (params.state !== req.session.state) {
            throw new Error('State mismatch - Possible CSRF attack');
        }

        console.log('Code d\'autorisation reçu');

        // Échange du code contre les tokens
        const tokenSet = await keycloakClient.callback(
            process.env.REDIRECT_URI,
            params,
            {
                code_verifier: req.session.codeVerifier,
                state: req.session.state
            }
        );

        console.log('Tokens obtenus:', {
            access_token: tokenSet.access_token ? '✓' : '✗',
            id_token: tokenSet.id_token ? '✓' : '✗',
            refresh_token: tokenSet.refresh_token ? '✓' : '✗'
        });

        // Récupération des informations utilisateur
        const userinfo = await keycloakClient.userinfo(tokenSet.access_token);

        // Sauvegarde en session
        req.session.tokenSet = tokenSet;
        req.session.userinfo = userinfo;

        // Nettoyage des variables temporaires
        delete req.session.codeVerifier;
        delete req.session.state;

        console.log('Utilisateur authentifié:', userinfo.preferred_username);
        res.redirect('/profile');
    } catch (error) {
        console.error('Erreur lors du callback:', error);
        res.render('pages/error', {
            title: 'Erreur d\'authentification',
            message: `Une erreur est survenue lors de l'authentification: ${error.message}`
        });
    }
});

/**
 * GET /logout
 * Déconnexion de l'utilisateur
 */
router.get('/logout', (req, res) => {
    const keycloakClient = req.app.locals.keycloakClient;
    const tokenSet = req.session.tokenSet;
    const port = process.env.PORT || 3000;

    req.session.destroy((err) => {
        if (err) {
            console.error('Erreur lors de la destruction de session:', err);
        }

        // Redirection vers le endpoint de logout Keycloak
        const logoutUrl = keycloakClient.endSessionUrl({
            id_token_hint: tokenSet?.id_token,
            post_logout_redirect_uri: `https://localhost:${port}/`
        });

        console.log('Déconnexion et redirection');
        res.redirect(logoutUrl);
    });
});

module.exports = router;