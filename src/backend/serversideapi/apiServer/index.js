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
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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

app.post('/add_artist', async (req, res) => {
    const { artist_name, location_city, location_region, music_genre, insta_handle } = req.body;
    fetch("/../db-api/add_artist.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            artist_name: artist_name,
            // longitude: getLongitude(city),
            // latitude: getLatitude(city),
            location_city: location_city,
            location_region: location_region,
            music_genre: music_genre,
            // image_src: image,
            insta_handle: insta_handle,

        })
    }).then(response => response.json())
    .then(data => {
        if (data.success) {
                res.json({ success: true, message: "Artist was successfully added to the database." });
        } else {
                res.json({ success: false, message: "Artist name, city, state, and music genre must be filled in." });
        }
    })
});

app.post('/search_genre', async (req, res) => {
    const { music_genre } = req.body;
    fetch("/../db-api/search_genre.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            music_genre: music_genre
        })
    }).then(response => response.json())
    .then(data => {
        res.json({ artists: data.artists });
    })
});

app.post('/verify_user', async (req, res) => {
    const { username, password } = req.body;
    fetch("/../db-api/verify_user.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    }).then(response => response.json())
    .then(data => {
        res.json({ verified: data.verified });
    })
});

app.post('/getFeaturedArtists', async (req, res) => {
    fetch("/../db-api/get_featured_artists.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        }
    }).then(response => response.json())
    .then(data => {
        res.json({ featured_artists: data.featured_artists });
    })
});