import { Router } from 'express';
import { dbApi } from '../services/dbApi.js';
import { requireLoggedIn } from '../utils/session.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';
import { requireFields, strField } from '../utils/validate.js';

const router = Router();

/**
 * GET /getFavorites
 * The signed-in user's favorited artists (full rows, alphabetical). The
 * username always comes from the session — never from the request. 401
 * when the cookie is missing or the session is unknown/expired.
 */
router.get(
    '/getFavorites',
    requireLoggedIn(),
    asyncHandler(async (req, res) => {
        const data = await dbApi.getFavorites(req.sessionUser.username);
        res.json({ favorites: Array.isArray(data?.favorites) ? data.favorites : [] });
    })
);

/**
 * POST /toggleFavorite
 * Adds or removes one favorite. Body: { artist_name }. The username always
 * comes from the session. 200 { favorited }; 400 on bad fields; 404 when
 * the artist doesn't exist.
 */
router.post(
    '/toggleFavorite',
    requireLoggedIn(),
    asyncHandler(async (req, res) => {
        const body = requireFields(req.body, ['artist_name']);
        const artistName = strField(body, 'artist_name');
        if (artistName.length === 0 || artistName.length > 50) {
            throw new ApiError('Field "artist_name" is required and max 50 characters.', 400);
        }
        const data = await dbApi.toggleFavorite(req.sessionUser.username, artistName);
        res.json({ favorited: data?.favorited === true });
    })
);

export default router;
