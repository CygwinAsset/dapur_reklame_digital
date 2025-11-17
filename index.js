// index.js

// 1. Import library yang dibutuhkan
const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const path = require('path');

// 2. Buat aplikasi Express
const app = express();
const PORT = 3000;

// 3. Konfigurasi Multer untuk upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Simpan file di folder 'uploads'
  },
  filename: function (req, file, cb) {
    // Buat nama file unik untuk menghindari bentrok
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// 4. Gunakan middleware
app.use(cors()); // Izinkan request dari mana saja
app.use(express.json()); // Izinkan server menerima data dalam format JSON

// Sajikan file yang diunggah agar bisa diakses secara publik
app.use('/uploads', express.static('uploads'));

// 5. Buat endpoint (rute) pertama
app.get('/', (req, res) => {
  res.json({ message: 'Backend Digital Signage is running!' });
});

// --- API untuk Players ---
app.post('/api/player/register', async (req, res) => {
  try {
    const { playerId, location } = req.body;
    if (!playerId || !location) {
      return res.status(400).json({ error: 'Player ID and Location are required' });
    }
    const queryText = 'INSERT INTO players(player_id, location, status) VALUES($1, $2, $3) RETURNING *';
    const values = [playerId, location, 'online'];
    const result = await db.query(queryText, values);
    res.status(201).json({ message: 'Player registered successfully!', player: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const queryText = 'SELECT * FROM players WHERE player_id = $1';
    const result = await db.query(queryText, [playerId]);
    if (result.rows.length > 0) {
      res.status(200).json({ message: 'Player found', player: result.rows[0] });
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/players', async (req, res) => {
  try {
    const queryText = 'SELECT * FROM players ORDER BY id ASC';
    const result = await db.query(queryText);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- API untuk Playlists ---
app.post('/api/playlists', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }
    const queryText = 'INSERT INTO playlists(name, description) VALUES($1, $2) RETURNING *';
    const values = [name, description];
    const result = await db.query(queryText, values);
    res.status(201).json({ message: 'Playlist created successfully!', playlist: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const queryText = 'SELECT * FROM playlists ORDER BY created_at DESC';
    const result = await db.query(queryText);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- API untuk Penugasan Playlist ke Player ---
app.post('/api/players/:playerId/assign-playlist', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { playlistId } = req.body;
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    const playerResult = await db.query('SELECT id FROM players WHERE player_id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const playerDbId = playerResult.rows[0].id;
    const playlistResult = await db.query('SELECT id FROM playlists WHERE id = $1', [playlistId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    await db.query('DELETE FROM player_playlists WHERE player_id = $1', [playerDbId]);
    const queryText = 'INSERT INTO player_playlists(player_id, playlist_id) VALUES($1, $2) RETURNING *';
    const values = [playerDbId, playlistId];
    const assignmentResult = await db.query(queryText, values);
    res.status(201).json({ message: 'Playlist assigned successfully!', assignment: assignmentResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- API untuk Konten ---
app.post('/api/contents', upload.single('contentFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { filename, originalname, mimetype } = req.file;
    const fileType = mimetype.split('/')[0];
    const fileUrl = `/uploads/${filename}`;
    const queryText = 'INSERT INTO contents(filename, original_name, type, url) VALUES($1, $2, $3, $4) RETURNING *';
    const values = [filename, originalname, fileType, fileUrl];
    const result = await db.query(queryText, values);
    res.status(201).json({ message: 'Content uploaded successfully!', content: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/playlists/:playlistId/add-content', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { contentId } = req.body;
    if (!contentId) {
      return res.status(400).json({ error: 'Content ID is required' });
    }
    const orderResult = await db.query('SELECT MAX(content_order) as last_order FROM playlist_contents WHERE playlist_id = $1', [playlistId]);
    const nextOrder = (orderResult.rows[0].last_order || 0) + 1;
    const queryText = 'INSERT INTO playlist_contents(playlist_id, content_id, content_order) VALUES($1, $2, $3) RETURNING *';
    const values = [playlistId, contentId, nextOrder];
    const result = await db.query(queryText, values);
    res.status(201).json({ message: 'Content added to playlist successfully!', playlistContent: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- API Utama untuk Player Mengambil Playlistnya ---
app.get('/api/players/:playerId/playlist', async (req, res) => {
  try {
    const { playerId } = req.params;
    const playlistQuery = `
      SELECT pl.id as playlist_id, pl.name, pl.description, pl.updated_at
      FROM player_playlists pp
      JOIN playlists pl ON pp.playlist_id = pl.id
      JOIN players p ON pp.player_id = p.id
      WHERE p.player_id = $1
    `;
    const playlistResult = await db.query(playlistQuery, [playerId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'No playlist assigned to this player' });
    }
    const playlist = playlistResult.rows[0];
    const contentsQuery = `
      SELECT c.id, c.original_name, c.type, c.url
      FROM playlist_contents pc
      JOIN contents c ON pc.content_id = c.id
      WHERE pc.playlist_id = $1
      ORDER BY pc.content_order ASC
    `;
    const contentsResult = await db.query(contentsQuery, [playlist.playlist_id]);
    playlist.contents = contentsResult.rows;
    res.status(200).json({ message: 'Playlist found for this player', playlist: playlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint untuk menghapus player
app.delete('/api/players/:id', async (req, res) => {
  try {
    const { id } = req.params; // Ambil id dari URL

    const queryText = 'DELETE FROM players WHERE id = $1';
    await db.query(queryText, [id]);

    res.status(200).json({ message: 'Player deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint untuk menghapus playlist
app.delete('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Menghapus playlist akan otomatis menghapus penugasan di 'player_playlists'
    // dan konten di 'playlist_contents' karena kita menggunakan ON DELETE CASCADE
    const queryText = 'DELETE FROM playlists WHERE id = $1';
    await db.query(queryText, [id]);

    res.status(200).json({ message: 'Playlist deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint untuk mengambil semua konten
app.get('/api/contents', async (req, res) => {
  try {
    const queryText = 'SELECT * FROM contents ORDER BY created_at DESC';
    const result = await db.query(queryText);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Endpoint untuk menghapus konten
app.delete('/api/contents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Menghapus konten dari 'playlist_contents' dan 'contents' akan otomatis
    // karena kita menggunakan ON DELETE CASCADE
    const queryText = 'DELETE FROM contents WHERE id = $1';
    await db.query(queryText, [id]);

    res.status(200).json({ message: 'Content deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 6. Jalankan server
app.listen(PORT, () => {
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});