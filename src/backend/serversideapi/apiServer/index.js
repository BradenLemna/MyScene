//--------------------------------------------
// Server side API calls. These are the functions that will be called by the frontend to get data from the APIs.
// Author: Braden Lemna
//--------------------------------------------

import { autoCompleteCity, getLatitude, getLongitude, getLocation } from "../apiCalls/locationIQAPICall.js";
import { getGenre } from "../apiCalls/lastFMAPICall.js";
import express from 'express';
import cors from 'cors';

const allowedOrigins = ['https://myscene.live', 'http://127.0.0.1:5500'];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

const app = express();
app.use(cors(corsOptions));
const port = 3000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

app.use(express.json());

app.get('/', (req, res) => {
    res.json('API is running!');
});

app.get('/autocomplete', async (req, res) => {
    const city = req.query.city;
    const suggestions = await autoCompleteCity(city);
    res.json({ suggestions });
});

app.get('/getLatitude', async (req, res) => {
    const gid = req.query.gid;
    const latitude = await getLatitude(gid);
    res.json({ latitude });
});

app.get('/getLongitude', async (req, res) => {
    const gid = req.query.gid;
    const longitude = await getLongitude(gid);
    res.json({ longitude });
});

app.get('/getLocation', async (req, res) => {
    const gid = req.query.gid;
    const location = await getLocation(gid);
    res.json({ location });
});

app.get('/getGenre', async (req, res) => {
    const artist = req.query.artist;
    const genre = await getGenre(artist);
    res.json({ genre });
});