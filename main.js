const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Constants and Global Variables
const ID_LEN = 15;
const SITE_NAME = process.env.ENV_SITE_NAME || `http://localhost:${port}`;
const DBG = process.env.DBG === 'true' || false;
let DBG_DATASTORE = {};
let db = null;

// Helper function to generate a random short URL ID
function generateShortUrlId() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < ID_LEN; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Database Setup
function db_setup() {
    if (DBG) {
        console.log("Debug Mode: Using in-memory datastore.");
        return;
    }
    
    try {
        db = new Database('redirdata.db');
        db.pragma('journal_mode = WAL')
        const sql = `
            CREATE TABLE IF NOT EXISTS redirbase (
                create_time DATE,
                first_url TEXT,
                redirect_url TEXT,
                short_url TEXT,
                access_count INT
            );
        `;
        db.prepare(sql).run();
        console.log('Database setup complete.');
    } catch (err) {
        console.error('Error setting up database:', err);
    }
}

// Routes
app.get('/', (req, res) => {
    const htmlContent = `
    <html>
        <head>
            <title>One-shot Redirect</title>
        </head>
        <body>
            <form id="redirrequ" action="/redir" method="post">
                <label for="longlink">Real Destination:</label>
                <input type="text" name="longlink" value="">
                <label for="firstlink">First Destination:</label>
                <input type="text" name="firstlink" value="">
                <input type="submit">
            </form>
        </body>
    </html>`;
    res.status(200).send(htmlContent);
});

app.post('/redir', (req, res) => {
    const { longlink, firstlink } = req.body;
    const fullid = generateShortUrlId();

    console.log(`Creating redirect\ninit ${firstlink}\nfini ${longlink}\n  as ${fullid}`);

    add_redirect(fullid, longlink, firstlink);

    const redir_url = `${SITE_NAME}/l/${fullid}`;
    res.status(201).send(redir_url);
});

app.get('/l/:shortlink', (req, res) => {
    const { shortlink } = req.params;
    let data = null;

    console.log(shortlink);

    if (!DBG) {
        const stmt = db.prepare("SELECT first_url, redirect_url, access_count FROM redirbase WHERE short_url = ?");
        data = stmt.get(shortlink);
    } else {
        data = DBG_DATASTORE[shortlink];
        console.log(data)
    }
    
    if (!data) {
        return res.status(404).send('Short URL not found.');
    }

    if (!DBG) {
        console.log(data.first_url)
        console.log(data.redirect_url)
        console.log(data.access_count)
    }

    const accessCount = DBG ? data[4] : data.access_count;
    const newCount = accessCount + 1;
    count_redirect(shortlink, newCount);

    const firstUrl = DBG ? data[1] : data.first_url;
    const redirectUrl = DBG ? data[2] : data.redirect_url;
    
    if (accessCount === 0) {
        return res.redirect(firstUrl);
    } else {
        return res.redirect(redirectUrl);
    }
});

app.get('/favicon.ico', (req, res) => {
    res.status(404).send();
});

// Database Operations
function add_redirect(shorturl, longurl, firsturl) {
    if (!DBG) {
        const stmt = db.prepare("INSERT INTO redirbase (create_time, first_url, redirect_url, short_url, access_count) VALUES (?, ?, ?, ?, ?)");
        stmt.run(Date.now(), firsturl, longurl, shorturl, 0);
    } else {
        DBG_DATASTORE[shorturl] = [Date.now(), firsturl, longurl, shorturl, 0];
    }
}

function count_redirect(shorturl, newcount) {
    if (!DBG) {
        const stmt = db.prepare("UPDATE redirbase SET access_count = ? WHERE short_url = ?");
        stmt.run(newcount, shorturl);
    } else {
        DBG_DATASTORE[shorturl][4] = newcount;
    }
}

// Startup
app.listen(port, () => {
    console.log(`Server running at ${SITE_NAME}`);
    db_setup();
});
