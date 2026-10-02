// Auth routes — verify a username/password pair against the Users table.
// The actual credential check happens in the PHP db-api layer (bcrypt with
// transparent legacy-plaintext upgrade); this route only validates the
// request shape and passes the result through.
//
//   POST /verify_user { username, password } -> { verified: true|false }

import { Router } from 'express';

import { dbApi } from '../services/dbApi.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireFields, strField } from '../utils/validate.js';

const router = Router();

router.post('/verify_user', asyncHandler(async (req, res) => {
    const body = requireFields(req.body, ['username', 'password']);
    const data = await dbApi.verifyUser(strField(body, 'username'), body.password);
    res.json({ verified: data?.verified === true });
}));

export default router;
